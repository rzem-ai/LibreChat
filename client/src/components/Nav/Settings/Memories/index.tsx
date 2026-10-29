// Deloitte Custom Change: dedicated Memories panel for the Settings tab, gated by the
// `memoriesInSettings` flag. Reuses the shared memory-panel state/hooks so this and the
// sidebar panel behave identically.
import { useState } from 'react';
import { Button, Spinner, Dropdown, FilterInput } from '@librechat/client';
import useMemoryPanelState from '~/components/SidePanel/Memories/useMemoryPanelState';
import MemoryPanelFooter from '~/components/SidePanel/Memories/MemoryPanelFooter';
import MemoryList from '~/components/SidePanel/Memories/MemoryList';
import MemoryCreateRow, { AddMemoryLabel } from './MemoryCreateRow';
import MemoryToggle from '../MemoryToggle';
import { useLocalize } from '~/hooks';

export default function MemoriesSettingsPanel() {
  const localize = useLocalize();
  const [isCreating, setIsCreating] = useState(false);
  const {
    isLoading,
    currentRows,
    pageIndex,
    setPageIndex,
    totalPages,
    filteredMemories,
    isFiltered,
    searchQuery,
    setSearchQuery,
    partitionOptions,
    activePartition,
    setPartitionFilter,
    hasUpdateAccess,
    hasCreateAccess,
    hasOptOutAccess,
  } = useMemoryPanelState();

  if (isLoading) {
    return (
      <div className="flex h-32 w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Deloitte Custom Change: no separate `!hasReadAccess` fallback here — the tab's own
  // `show` guard (types.ts: `memoriesTabEnabled && hasMemoriesAccess`) already requires
  // READ access before this component can render at all.
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">{localize('com_ui_memories')}</h3>
      <p className="text-sm text-text-secondary">
        {localize('com_ui_memories_settings_description')}
      </p>

      {hasOptOutAccess && <MemoryToggle />}

      <FilterInput
        inputId="memory-settings-search"
        label={localize('com_ui_memories_filter')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {partitionOptions && (
        <Dropdown
          value={activePartition}
          onChange={setPartitionFilter}
          options={partitionOptions}
          className="w-full"
          ariaLabel={localize('com_ui_memories_partition_filter')}
          testId="memory-settings-partition-filter"
        />
      )}

      <div className="space-y-2">
        <MemoryList
          memories={currentRows}
          hasUpdateAccess={hasUpdateAccess}
          isFiltered={isFiltered}
          deleteMode="inline"
          emptyStateAction={
            hasCreateAccess && !isCreating ? (
              <Button variant="outline" size="sm" onClick={() => setIsCreating(true)}>
                <AddMemoryLabel />
              </Button>
            ) : undefined
          }
        />
        {hasCreateAccess && (isCreating || currentRows.length > 0) && (
          <MemoryCreateRow
            isCreating={isCreating}
            onOpen={() => setIsCreating(true)}
            onClose={() => setIsCreating(false)}
          />
        )}
      </div>

      <MemoryPanelFooter
        totalCount={filteredMemories.length}
        pageIndex={pageIndex}
        setPageIndex={setPageIndex}
        totalPages={totalPages}
      />
    </div>
  );
}
