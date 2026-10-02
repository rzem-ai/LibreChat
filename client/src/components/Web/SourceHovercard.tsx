import React, { ReactNode } from 'react';
import * as Ariakit from '@ariakit/react';
import { VisuallyHidden } from '@ariakit/react';
import { ChevronDown, FileText, Folder } from 'lucide-react';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export interface SourceData {
  link: string;
  title?: string;
  attribution?: string;
  snippet?: string;
  /** Deloitte Custom Change: citation date, formatted for display (e.g. "06 Nov 2025"). */
  date?: string;
}

interface SourceHovercardProps {
  source: SourceData;
  label: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  isFile?: boolean;
  isLocalFile?: boolean;
  /** Deloitte Custom Change: icon shown inside the chip itself; defaults to a generic file icon. */
  chipIcon?: ReactNode;
  children?: ReactNode;
  filePages?: number[];
  fileRelevance?: number;
}

function getFaviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function getCleanDomain(url: string) {
  const domain = url.replace(/(^\w+:|^)\/\//, '').split('/')[0];
  return domain.startsWith('www.') ? domain.substring(4) : domain;
}

// Deloitte Custom Change: decorative — the domain is always rendered as adjacent text, so an
// accessible name here would cause screen readers to announce it twice.
export function FaviconImage({ domain, className = '' }: { domain: string; className?: string }) {
  // Deloitte Custom Change: rounded corners to match the Connector logos in the admin panel
  return (
    <img
      src={getFaviconUrl(domain)}
      alt=""
      aria-hidden="true"
      className={cn('size-4 shrink-0 rounded-md', className)}
      loading="lazy"
    />
  );
}

/**
 * Deloitte Custom Change: full hovercard body: title at the top (underlined
 * when it links out or opens a preview, plain text otherwise), then any
 * additional content, then the source icon + name as a footer at the bottom
 * of the card.
 */
export function TooltipContent({
  icon,
  title,
  href,
  onClick,
  subtitle,
  // Deloitte Custom Change: citation date, shown below the title
  date,
  dateLabelKey = 'com_citation_published',
  children,
}: {
  icon: ReactNode;
  title: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  subtitle?: string;
  date?: string;
  dateLabelKey?: TranslationKeys;
  children?: ReactNode;
}) {
  const localize = useLocalize();
  const titleClassName =
    'inline-block break-words text-sm font-medium leading-[1.5] text-text-primary';
  let titleElement: ReactNode;
  if (href) {
    titleElement = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(titleClassName, 'underline underline-offset-2')}
      >
        {title}
      </a>
    );
  } else if (onClick) {
    titleElement = (
      <button
        type="button"
        onClick={onClick}
        className={cn(titleClassName, 'text-left underline underline-offset-2')}
      >
        {title}
      </button>
    );
  } else {
    titleElement = <span className={titleClassName}>{title}</span>;
  }

  return (
    <div className="min-w-0">
      {titleElement}
      {/* Deloitte Custom Change: citation date, shown below the title */}
      {date && (
        <p className="mt-0.5 text-xs text-text-secondary">{localize(dateLabelKey, { date })}</p>
      )}
      {children}
      {subtitle && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
          {icon}
          {subtitle}
        </div>
      )}
    </div>
  );
}

const hovercardClass = cn(
  'z-[999] w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-border-medium bg-surface-secondary p-3 text-text-primary shadow-lg',
  'origin-top -translate-y-1 opacity-0 transition-[opacity,transform] duration-150 ease-out',
  'data-[enter]:translate-y-0 data-[enter]:opacity-100',
  'data-[leave]:-translate-y-1 data-[leave]:opacity-0',
);

function FileHovercardContent({
  source,
  onClick,
  filePages,
  fileRelevance,
}: {
  source: SourceData;
  onClick?: (e: React.MouseEvent) => void;
  filePages?: number[];
  fileRelevance?: number;
}) {
  const localize = useLocalize();
  const fileName = source.attribution || source.title || localize('com_file_source');

  // Deloitte Custom Change: shared TooltipContent layout replaces the old inline header markup
  return (
    <TooltipContent
      icon={<Folder className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />}
      title={fileName}
      onClick={onClick}
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

export function SourceHovercard({
  source,
  label,
  onMouseEnter,
  onMouseLeave,
  onClick,
  isFile = false,
  isLocalFile = false,
  chipIcon,
  children,
  filePages,
  fileRelevance,
}: SourceHovercardProps) {
  const localize = useLocalize();
  const domain = getCleanDomain(source.link || '');
  const hovercard = Ariakit.useHovercardStore({ showTimeout: 150, hideTimeout: 150 });

  const handleFileClick = React.useCallback(
    (e: React.MouseEvent) => {
      hovercard.hide();
      onClick?.(e);
    },
    [hovercard, onClick],
  );

  return (
    <span className="relative ml-0.5 inline-block">
      <Ariakit.HovercardProvider store={hovercard}>
        <span className="flex items-center">
          <Ariakit.HovercardAnchor
            render={
              isFile ? (
                <button
                  type="button"
                  onClick={handleFileClick}
                  // Deloitte Custom Change: taller chip + split left/right padding to fit the
                  // connector/MCP icon, rounded-md to match Connector logos (dark-mode handled by
                  // the design-system tokens upstream now relies on, so the old dark: overrides
                  // are dropped)
                  className="ml-1 inline-flex h-[22px] max-w-44 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-border-heavy bg-surface-secondary pl-1 pr-2 text-xs font-medium text-text-primary no-underline transition-colors hover:bg-surface-hover"
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  title={isLocalFile ? localize('com_sources_download_local_unavailable') : label}
                >
                  {/* Deloitte Custom Change: connector-specific chip icon, falls back to a generic file icon */}
                  {chipIcon ?? (
                    <FileText
                      className="size-2.5 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                  )}
                  {label}
                </button>
              ) : (
                <a
                  href={source.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  // Deloitte Custom Change: wider chip (max-w-44) + rounded-md to match Connector
                  // logos
                  className="ml-1 inline-block h-5 max-w-44 cursor-pointer items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-border-heavy bg-surface-secondary px-2 text-xs font-medium no-underline transition-colors hover:bg-surface-hover"
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  title={label}
                >
                  {label}
                </a>
              )
            }
          />
          <Ariakit.HovercardDisclosure className="ml-0.5 rounded-full text-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary">
            <VisuallyHidden>{localize('com_citation_more_details', { label })}</VisuallyHidden>
            <ChevronDown className="icon-sm" aria-hidden="true" />
          </Ariakit.HovercardDisclosure>

          <Ariakit.Hovercard
            gutter={16}
            className={hovercardClass}
            portal={true}
            unmountOnHide={true}
          >
            <div>
              {children ??
                (isFile ? (
                  <FileHovercardContent
                    source={source}
                    onClick={handleFileClick}
                    filePages={filePages}
                    fileRelevance={fileRelevance}
                  />
                ) : (
                  <TooltipContent
                    icon={<FaviconImage domain={domain} />}
                    title={source.title || source.link}
                    href={source.link}
                    subtitle={domain}
                    // Deloitte Custom Change: citation date
                    date={source.date}
                  >
                    {source.snippet && (
                      <p className="mt-1.5 line-clamp-4 break-words text-xs text-text-secondary md:text-sm">
                        {source.snippet}
                      </p>
                    )}
                  </TooltipContent>
                ))}
            </div>
          </Ariakit.Hovercard>
        </span>
      </Ariakit.HovercardProvider>
    </span>
  );
}
