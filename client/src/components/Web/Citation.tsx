import { memo, useState, useContext, useCallback } from 'react';
import { normalizeServerName } from 'librechat-data-provider';
import { FileText, Folder, TriangleAlert } from 'lucide-react';
import type { ReactNode, MouseEvent } from 'react';
import type { SourceData } from '~/components/Web/SourceHovercard';
import type { CitationProps } from './types';
import { SourceHovercard, TooltipContent, getCleanDomain } from '~/components/Web/SourceHovercard';
import { CitationContext, useCitation, useCompositeCitations, useHighlightState } from './Context';
import FilePreviewDialog from '~/components/Chat/Messages/Content/FilePreviewDialog';
import { useMCPServerMaps, useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface FileCitationMetadata {
  fileBytes?: number;
  fileType?: string;
}

interface FileCitationSource {
  attribution?: string;
  citationId?: string | null;
  citationIds?: Array<string>;
  fileId?: string;
  fileName?: string;
  link?: string;
  metadata?: FileCitationMetadata;
  pageRelevance?: Record<number, number>;
  pages?: number[];
  refType?: string;
  relevance?: number;
  snippet?: string;
  title?: string;
  /** MCP-specific fields */
  toolName?: string;
  serverName?: string;
  usageRestriction?: boolean;
  usageRestrictionLink?: string;
}

// Deloitte Custom Change: max filename length shown on a file_search citation chip
const FILE_CHIP_LABEL_MAX_LENGTH = 10;

function isHttpLink(link?: string): link is string {
  return typeof link === 'string' && (link.startsWith('http://') || link.startsWith('https://'));
}

/**
 * Deloitte Custom Change: configured display name for an MCP citation's server, if
 * one is set. `mcpServerTitles` is keyed by normalized server name (same contract as
 * `mcpIconMap`), so the lookup key must be normalized too — otherwise a server name
 * with special characters would resolve its icon but not its title.
 */
function getMCPServerLabel(mcpServerTitles: Map<string, string>, serverName?: string) {
  return serverName ? mcpServerTitles.get(normalizeServerName(serverName)) : undefined;
}

/**
 * Deloitte Custom Change: MCP tooltip footer text — configured server label, else the
 * cleaned domain when the source has a real http(s) link, else the raw server name.
 * Avoids surfacing the `#mcp-...` placeholder link as a fake domain.
 */
function getMCPSubtitle(mcpServerTitles: Map<string, string>, serverName?: string, link?: string) {
  return (
    getMCPServerLabel(mcpServerTitles, serverName) ??
    (isHttpLink(link) ? getCleanDomain(link) : serverName)
  );
}

/**
 * Deloitte Custom Change: MCP citation icon — the server's configured logo when
 * one exists, falling back to a generic document icon otherwise. Shared by chips
 * (size-3.5) and tooltip headers (size-4).
 */
function MCPIcon({
  mcpIconMap,
  serverName,
  className,
}: {
  mcpIconMap: Map<string, string>;
  serverName: string | undefined;
  className: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const iconPath = serverName ? mcpIconMap.get(normalizeServerName(serverName)) : undefined;
  if (!iconPath || failedSrc === iconPath) {
    return <FileText className={className} aria-hidden="true" />;
  }
  return (
    <img
      src={iconPath}
      alt=""
      aria-hidden="true"
      className={cn(className, 'object-contain')}
      onError={() => setFailedSrc(iconPath)}
    />
  );
}

/** Deloitte Custom Change: chip icon — a folder for file_search citations, an MCP server logo (or fallback) for MCP citations. */
function getChipIcon(
  isFileType: boolean,
  isMCPType: boolean,
  mcpIconMap: Map<string, string>,
  serverName?: string,
) {
  if (isFileType) {
    return <Folder className="size-2.5 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  if (isMCPType) {
    // Deloitte Custom Change: round corners to match Connector logos
    return (
      <MCPIcon
        mcpIconMap={mcpIconMap}
        serverName={serverName}
        className="size-3.5 shrink-0 rounded-sm text-text-secondary"
      />
    );
  }
  return undefined;
}

/**
 * Deloitte Custom Change: chip label for a file_search citation — the first 10
 * characters of the filename, followed by an ellipsis when it's longer.
 */
function truncateFileChipLabel(fileName: string) {
  return fileName.length > FILE_CHIP_LABEL_MAX_LENGTH
    ? `${fileName.slice(0, FILE_CHIP_LABEL_MAX_LENGTH)}...`
    : fileName;
}

function getFileCitationData(source?: FileCitationSource) {
  const isFileType = source?.refType === 'file' && source.fileId != null;
  const isMCPType = source?.refType === 'mcp';

  return {
    isFileType,
    isMCPType,
    fileId: isFileType ? source.fileId : undefined,
    fileMeta: isFileType ? source.metadata : undefined,
    fileName: isFileType ? source.fileName : undefined,
    filePages: isFileType ? source.pages : undefined,
    fileRelevance: isFileType ? source.relevance : undefined,
    filePageRelevance: isFileType ? source.pageRelevance : undefined,
  };
}

/**
 * Deloitte Custom Change: usage-restriction notice for an MCP tooltip — omits the
 * "Learn more" link entirely when the source has no real http(s) link, instead of
 * rendering it as dead, non-clickable text.
 */
function UsageRestrictionNotice({ link }: { link?: string }) {
  const localize = useLocalize();
  return (
    <div className="mt-1.5 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-500">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {localize('com_citation_usage_restriction')}
        {isHttpLink(link) && (
          <>
            {' '}
            <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
              {localize('com_ui_learn_more')}
            </a>
          </>
        )}
      </span>
    </div>
  );
}

function toSourceData(source: FileCitationSource): SourceData {
  return {
    link: source.link ?? '',
    title: source.title,
    attribution: source.attribution,
    snippet: source.snippet,
  };
}

interface CitationChipProps {
  source: FileCitationSource;
  /** All citationIds this chip should publish on hover (a deduped source can own more than one). */
  citationIds: Array<string>;
}

/**
 * Deloitte Custom Change: renders a single citation chip + hovercard for one
 * resolved source. Shared by `Citation` (one ref) and `CompositeCitation`
 * (one chip per distinct source — no shared "+N" chip or internal pager, so
 * multiple links always render as multiple chips).
 */
function CitationChip({ source, citationIds }: CitationChipProps) {
  const localize = useLocalize();
  const { titleMap: mcpServerTitles, iconMap: mcpIconMap } = useMCPServerMaps();
  const { setHoveredCitationIds } = useContext(CitationContext);
  const [showPreview, setShowPreview] = useState(false);

  const {
    isFileType,
    isMCPType,
    fileId,
    fileMeta,
    fileName,
    filePages,
    fileRelevance,
    filePageRelevance,
  } = getFileCitationData(source);

  const handleFileClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isFileType && fileId) {
        setShowPreview(true);
      }
    },
    [isFileType, fileId],
  );

  const getCitationLabel = () => {
    // Deloitte Custom Change: file_search citations show a truncated filename, not the tool name
    if (isFileType) {
      return truncateFileChipLabel(fileName || source.title || localize('com_file_source'));
    }
    if (isMCPType) {
      return (
        getMCPServerLabel(mcpServerTitles, source.serverName) ||
        source.title ||
        source.attribution ||
        getCleanDomain(source.link || '') ||
        localize('com_citation_source')
      );
    }
    return (
      source.attribution ||
      source.title ||
      getCleanDomain(source.link || '') ||
      localize('com_citation_source')
    );
  };

  // Deloitte Custom Change: hovercard bodies rebuilt on the shared TooltipContent layout
  const renderSourceContent = () => {
    if (isFileType) {
      return (
        <TooltipContent
          icon={<Folder className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />}
          title={fileName || source.title || localize('com_file_source')}
          onClick={handleFileClick}
          subtitle={localize('com_ui_tool_name_file_search')}
        >
          {(fileRelevance != null || (filePages && filePages.length > 0)) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {fileRelevance != null && fileRelevance > 0 && (
                <span className="text-xs text-text-secondary">
                  {localize('com_ui_relevance')}: {Math.round(fileRelevance * 100)}%
                </span>
              )}
              {filePages && filePages.length > 0 && (
                <span className="text-xs text-text-secondary">
                  {localize('com_file_pages', { pages: filePages.join(', ') })}
                </span>
              )}
            </div>
          )}
          {source.snippet && (
            <p className="mt-1.5 line-clamp-3 break-words text-xs leading-snug text-text-secondary">
              {source.snippet}
            </p>
          )}
        </TooltipContent>
      );
    }

    if (isMCPType) {
      // Deloitte Custom Change: round corners to match Connector logos
      return (
        <TooltipContent
          icon={
            <MCPIcon
              mcpIconMap={mcpIconMap}
              serverName={source.serverName}
              className="size-4 shrink-0 rounded-md text-text-secondary"
            />
          }
          title={source.title || getCitationLabel()}
          href={isHttpLink(source.link) ? source.link : undefined}
          subtitle={getMCPSubtitle(mcpServerTitles, source.serverName, source.link)}
        >
          {source.snippet && (
            <p className="mt-1.5 line-clamp-3 break-words text-xs leading-snug text-text-secondary">
              {source.snippet}
            </p>
          )}
          {source.usageRestriction && (
            <UsageRestrictionNotice link={source.usageRestrictionLink ?? source.link} />
          )}
        </TooltipContent>
      );
    }

    return null;
  };

  return (
    <>
      <SourceHovercard
        source={toSourceData(source)}
        label={getCitationLabel()}
        onMouseEnter={() => setHoveredCitationIds(citationIds.length > 0 ? citationIds : null)}
        onMouseLeave={() => setHoveredCitationIds(null)}
        onClick={isFileType ? handleFileClick : undefined}
        isFile={isFileType || isMCPType}
        chipIcon={getChipIcon(isFileType, isMCPType, mcpIconMap, source.serverName)}
        filePages={filePages}
        fileRelevance={fileRelevance}
      >
        {renderSourceContent()}
      </SourceHovercard>
      {isFileType && fileId && (
        <FilePreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          fileName={fileName || source.title || ''}
          fileId={fileId}
          relevance={fileRelevance}
          pages={filePages}
          pageRelevance={filePageRelevance}
          fileType={fileMeta?.fileType}
          fileSize={fileMeta?.fileBytes}
        />
      )}
    </>
  );
}

interface CompositeCitationProps {
  citationId?: string;
  node?: {
    properties?: CitationProps;
  };
}

export function CompositeCitation(props: CompositeCitationProps) {
  const { citations, citationId: groupCitationId } =
    props.node?.properties ?? ({} as CitationProps);
  const sources = useCompositeCitations(citations || []);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <>
      {sources.map((source, i) => {
        const fileSource = source as FileCitationSource;
        const citationIds =
          fileSource.citationIds && fileSource.citationIds.length > 0
            ? fileSource.citationIds
            : [groupCitationId].filter((id): id is string => !!id);
        return <CitationChip key={i} source={fileSource} citationIds={citationIds} />;
      })}
    </>
  );
}

interface CitationComponentProps {
  citationId: string;
  citationType: 'span' | 'standalone' | 'composite' | 'group' | 'navlist';
  node?: {
    properties?: CitationProps;
  };
}

export function Citation(props: CitationComponentProps) {
  const { citation, citationId } = props.node?.properties ?? {};
  const refData = useCitation({
    turn: citation?.turn || 0,
    refType: citation?.refType,
    index: citation?.index || 0,
  }) as FileCitationSource | undefined;

  if (!refData) {
    return null;
  }

  return <CitationChip source={refData} citationIds={citationId ? [citationId] : []} />;
}

export interface HighlightedTextProps {
  children: ReactNode;
  citationId?: string;
}

export const HighlightedText = memo(function HighlightedText({
  children,
  citationId,
}: HighlightedTextProps) {
  const isHighlighted = useHighlightState(citationId);

  return (
    <span
      className={`rounded px-0 py-0.5 transition-colors ${isHighlighted ? 'bg-amber-300/20' : ''}`}
    >
      {children}
    </span>
  );
});
