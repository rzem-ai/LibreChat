import { memo, useState, useContext, useCallback } from 'react';
import { Button } from '@librechat/client';
import { ChevronLeft, ChevronRight, FileText, Folder, TriangleAlert } from 'lucide-react';
import type { SourceData } from '~/components/Web/SourceHovercard';
import type { CitationProps } from './types';
import {
  SourceHovercard,
  TooltipContent,
  FaviconImage,
  getCleanDomain,
} from '~/components/Web/SourceHovercard';
import FilePreviewDialog from '~/components/Chat/Messages/Content/FilePreviewDialog';
import { CitationContext, useCitation, useCompositeCitations } from './Context';
import { useMCPServerTitleMap, useLocalize } from '~/hooks';

interface FileCitationMetadata {
  fileBytes?: number;
  fileType?: string;
}

interface FileCitationSource {
  attribution?: string;
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
}

// Deloitte Custom Change: max filename length shown on a file_search citation chip
const FILE_CHIP_LABEL_MAX_LENGTH = 10;

function isHttpLink(link?: string): link is string {
  return typeof link === 'string' && (link.startsWith('http://') || link.startsWith('https://'));
}

/** Deloitte Custom Change: configured display name for an MCP citation's server, if one is set. */
function getMCPServerLabel(mcpServerTitles: Map<string, string>, serverName?: string) {
  return serverName ? mcpServerTitles.get(serverName) : undefined;
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

/** Deloitte Custom Change: chip icon — a folder for file_search citations, a document for all MCP citations. */
function getChipIcon(isFileType: boolean, isMCPType: boolean) {
  if (isFileType) {
    return <Folder className="size-2.5 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  if (isMCPType) {
    return <FileText className="size-2.5 shrink-0 text-text-secondary" aria-hidden="true" />;
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

interface CompositeCitationProps {
  citationId?: string;
  node?: {
    properties?: CitationProps;
  };
}

export function CompositeCitation(props: CompositeCitationProps) {
  const localize = useLocalize();
  const { citations, citationId } = props.node?.properties ?? ({} as CitationProps);
  const { setHoveredCitationId } = useContext(CitationContext);
  const [currentPage, setCurrentPage] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const sources = useCompositeCitations(citations || []);
  const mcpServerTitles = useMCPServerTitleMap();

  if (!sources || sources.length === 0) {
    return null;
  }
  const totalPages = sources.length;

  const getCitationLabel = () => {
    if (!sources || sources.length === 0) {
      return localize('com_citation_source');
    }

    const firstSource = sources[0] as FileCitationSource;
    const remainingCount = sources.length - 1;
    const { isFileType: isFirstFile, isMCPType: isFirstMCP } = getFileCitationData(firstSource);

    // Deloitte Custom Change: file_search citations show a truncated filename, not the tool name
    let attribution: string;
    if (isFirstFile) {
      attribution = truncateFileChipLabel(
        firstSource.fileName || firstSource.title || localize('com_file_source'),
      );
    } else if (isFirstMCP) {
      attribution =
        getMCPServerLabel(mcpServerTitles, firstSource.serverName) ||
        firstSource.title ||
        firstSource.attribution ||
        getCleanDomain(firstSource.link || '') ||
        localize('com_citation_source');
    } else {
      attribution =
        firstSource.attribution ||
        firstSource.title ||
        getCleanDomain(firstSource.link || '') ||
        localize('com_citation_source');
    }

    return remainingCount > 0 ? `${attribution} +${remainingCount}` : attribution;
  };

  const handlePrevPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const currentSource = sources[currentPage] as FileCitationSource;
  const {
    isFileType,
    isMCPType,
    fileId,
    fileMeta,
    fileName,
    filePages,
    fileRelevance,
    filePageRelevance,
  } = getFileCitationData(currentSource);

  const handleFileClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFileType && fileId) {
      setShowPreview(true);
    }
  };

  const renderPageNav = () => {
    if (totalPages <= 1) {
      return null;
    }
    return (
      <div className="mt-2 flex items-center gap-1 border-t border-border-light pt-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={handlePrevPage}
          disabled={currentPage === 0}
          className="size-7"
          aria-label="Previous source"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
        </Button>
        {sources.map((source, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPage(i);
            }}
            className={`flex size-6 items-center justify-center rounded text-xs transition-colors ${
              i === currentPage
                ? 'bg-surface-hover font-medium text-text-primary'
                : 'text-text-secondary hover:bg-surface-hover'
            }`}
            aria-label={`Source ${i + 1}`}
            aria-current={i === currentPage ? 'true' : undefined}
          >
            {i + 1}
          </button>
        ))}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleNextPage}
          disabled={currentPage === totalPages - 1}
          className="size-7"
          aria-label="Next source"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    );
  };

  // Deloitte Custom Change: hovercard bodies rebuilt on the shared TooltipContent layout
  const renderSourceContent = () => {
    if (isFileType) {
      return (
        <TooltipContent
          icon={<Folder className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />}
          title={fileName || currentSource.title || localize('com_file_source')}
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
          {currentSource.snippet && (
            <p className="mt-1.5 line-clamp-3 break-words text-xs leading-snug text-text-secondary">
              {currentSource.snippet}
            </p>
          )}
          {renderPageNav()}
        </TooltipContent>
      );
    }

    if (isMCPType) {
      return (
        <TooltipContent
          icon={<FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />}
          title={currentSource.title || getCitationLabel()}
          href={isHttpLink(currentSource.link) ? currentSource.link : undefined}
          subtitle={getMCPSubtitle(mcpServerTitles, currentSource.serverName, currentSource.link)}
        >
          {currentSource.snippet && (
            <p className="mt-1.5 line-clamp-3 break-words text-xs leading-snug text-text-secondary">
              {currentSource.snippet}
            </p>
          )}
          {currentSource.usageRestriction && <UsageRestrictionNotice link={currentSource.link} />}
          {renderPageNav()}
        </TooltipContent>
      );
    }

    return (
      <TooltipContent
        icon={<FaviconImage domain={getCleanDomain(currentSource.link || '')} />}
        title={currentSource.title || currentSource.link || ''}
        href={currentSource.link}
        subtitle={getCleanDomain(currentSource.link || '')}
      >
        {currentSource.snippet && (
          <p className="mt-1.5 line-clamp-4 break-words text-xs text-text-secondary md:text-sm">
            {currentSource.snippet}
          </p>
        )}
        {renderPageNav()}
      </TooltipContent>
    );
  };

  return (
    <>
      <SourceHovercard
        source={toSourceData(currentSource)}
        label={getCitationLabel()}
        onMouseEnter={() => setHoveredCitationId(citationId || null)}
        onMouseLeave={() => setHoveredCitationId(null)}
        onClick={isFileType ? handleFileClick : undefined}
        isFile={isFileType || isMCPType}
        chipIcon={getChipIcon(isFileType, isMCPType)}
        filePages={filePages}
        fileRelevance={fileRelevance}
      >
        {renderSourceContent()}
      </SourceHovercard>
      {isFileType && fileId && (
        <FilePreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          fileName={fileName || currentSource.title || ''}
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

interface CitationComponentProps {
  citationId: string;
  citationType: 'span' | 'standalone' | 'composite' | 'group' | 'navlist';
  node?: {
    properties?: CitationProps;
  };
}

export function Citation(props: CitationComponentProps) {
  const localize = useLocalize();
  const { citation, citationId } = props.node?.properties ?? {};
  const { setHoveredCitationId } = useContext(CitationContext);
  const refData = useCitation({
    turn: citation?.turn || 0,
    refType: citation?.refType,
    index: citation?.index || 0,
  }) as FileCitationSource | undefined;

  const {
    isFileType,
    isMCPType,
    fileId,
    fileMeta,
    fileName,
    filePages,
    fileRelevance,
    filePageRelevance,
  } = getFileCitationData(refData);
  const mcpServerTitles = useMCPServerTitleMap();

  const [showPreview, setShowPreview] = useState(false);

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isFileType && fileId) {
        setShowPreview(true);
      }
    },
    [isFileType, fileId],
  );

  if (!refData) {
    return null;
  }

  const getCitationLabel = () => {
    // Deloitte Custom Change: file_search citations show a truncated filename, not the tool name
    if (isFileType) {
      return truncateFileChipLabel(fileName || refData.title || localize('com_file_source'));
    }
    if (isMCPType) {
      return (
        getMCPServerLabel(mcpServerTitles, refData.serverName) ||
        refData.title ||
        refData.attribution ||
        getCleanDomain(refData.link || '') ||
        localize('com_citation_source')
      );
    }
    return (
      refData.attribution ||
      refData.title ||
      getCleanDomain(refData.link || '') ||
      localize('com_citation_source')
    );
  };

  return (
    <>
      <SourceHovercard
        source={toSourceData(refData)}
        label={getCitationLabel()}
        onMouseEnter={() => setHoveredCitationId(citationId || null)}
        onMouseLeave={() => setHoveredCitationId(null)}
        onClick={isFileType ? handleFileClick : undefined}
        isFile={isFileType || isMCPType}
        chipIcon={getChipIcon(isFileType, isMCPType)}
        filePages={filePages}
        fileRelevance={fileRelevance}
      >
        {isMCPType ? (
          <TooltipContent
            icon={<FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />}
            title={refData.title || getCitationLabel()}
            href={isHttpLink(refData.link) ? refData.link : undefined}
            subtitle={getMCPSubtitle(mcpServerTitles, refData.serverName, refData.link)}
          >
            {refData.snippet && (
              <p className="mt-1.5 line-clamp-3 break-words text-xs leading-snug text-text-secondary">
                {refData.snippet}
              </p>
            )}
            {refData.usageRestriction && <UsageRestrictionNotice link={refData.link} />}
          </TooltipContent>
        ) : null}
      </SourceHovercard>
      {isFileType && fileId && (
        <FilePreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          fileName={fileName || refData.title || ''}
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

export interface HighlightedTextProps {
  children: React.ReactNode;
  citationId?: string;
}

export function useHighlightState(citationId: string | undefined) {
  const { hoveredCitationId } = useContext(CitationContext);
  return citationId && hoveredCitationId === citationId;
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
