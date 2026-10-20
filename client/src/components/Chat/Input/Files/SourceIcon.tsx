import { Search, Terminal, Type } from 'lucide-react';
import { EModelEndpoint, FileSources } from 'librechat-data-provider';
import type React from 'react';
import { MinimalIcon } from '~/components/Endpoints';
import { cn } from '~/utils';

const sourceToEndpoint = {
  [FileSources.openai]: EModelEndpoint.openAI,
  [FileSources.azure]: EModelEndpoint.azureOpenAI,
};

const sourceToClassname = {
  [FileSources.openai]: 'bg-white/75 dark:bg-black/65',
  [FileSources.azure]: 'azure-bg-color',
  [FileSources.azure_blob]: 'azure-bg-color',
  [FileSources.execute_code]: 'bg-black text-white opacity-85',
  /** Categorical rather than status: a source is an identity, so it takes a
   *  series slot and the label ink that pairs with one. No alpha here, which
   *  composited the fill back into the preview the badge sits on. */
  [FileSources.text]: 'bg-series-1 text-text-on-status',
  [FileSources.vectordb]: 'bg-series-4 text-text-on-status',
};

const defaultClassName =
  'absolute right-0 bottom-0 rounded-full p-[0.15rem] text-text-secondary transition-colors';

// Deloitte Custom Change: # Visible icons for file uploads- PR #402
export default function SourceIcon({
  source,
  isCodeFile,
  isFileSearch,
  className = defaultClassName,
  ...divProps
}: {
  source?: FileSources;
  isCodeFile?: boolean;
  isFileSearch?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>) {
  if (isCodeFile === true) {
    return (
      <div
        className={cn(className, sourceToClassname[FileSources.execute_code] ?? '')}
        {...divProps}
      >
        <span className="flex items-center justify-center text-white" aria-hidden="true">
          <Terminal className="h-3 w-3 stroke-[2.5]" />
        </span>
      </div>
    );
  }

  if (source === FileSources.text) {
    return (
      <div className={cn(className, sourceToClassname[source] ?? '')} {...divProps}>
        <span className="flex items-center justify-center">
          <Type className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    );
  }

  // Deloitte Custom Change: # Visible icons for file uploads- PR #402
  if (isFileSearch === true || source === FileSources.vectordb) {
    return (
      <div className={cn(className, sourceToClassname[FileSources.vectordb] ?? '')} {...divProps}>
        <span className="flex items-center justify-center text-white" aria-hidden="true">
          <Search className="h-3 w-3 stroke-[2.5]" />
        </span>
      </div>
    );
  }

  const endpoint = sourceToEndpoint[source ?? ''];

  if (!endpoint) {
    return null;
  }
  return (
    <div className={cn(className, sourceToClassname[source ?? ''] ?? '')} {...divProps}>
      <span className="flex items-center justify-center">
        <MinimalIcon
          endpoint={endpoint}
          size={14}
          isCreatedByUser={false}
          iconClassName="h-3 w-3"
        />
      </span>
    </div>
  );
}
