import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { SystemRoles } from 'librechat-data-provider';
import {
  Button,
  Checkbox,
  Dropdown,
  FilterInput,
  TooltipAnchor,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import { useUpdateMemoryPreferencesMutation } from '~/data-provider';
import { PanelFooter, PanelContent } from '~/components/ui';
import useMemoryPanelState from './useMemoryPanelState';
import { useLocalize, useAuthContext } from '~/hooks';
import MemoryCardSkeleton from './MemoryCardSkeleton';
import MemoryCreateDialog from './MemoryCreateDialog';
import MemoryUsageBadge from './MemoryUsageBadge';
import AdminSettings from './AdminSettings';
import MemoryList from './MemoryList';
import { cn } from '~/utils';

export default function MemoryPanel() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const {
    userData,
    memData,
    isLoading,
    filteredMemories,
    isFiltered,
    searchQuery,
    setSearchQuery,
    partitionOptions,
    activePartition,
    setPartitionFilter,
    hasReadAccess,
    hasUpdateAccess,
    hasCreateAccess,
    hasOptOutAccess,
  } = useMemoryPanelState();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);

  const updateMemoryPreferencesMutation = useUpdateMemoryPreferencesMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_preferences_updated'),
        status: 'success',
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_error_updating_preferences'),
        status: 'error',
      });
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  useEffect(() => {
    if (userData?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(userData.personalization.memories);
    }
  }, [userData?.personalization?.memories]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  if (!hasReadAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-text-secondary">{localize('com_ui_no_read_access')}</p>
        </div>
      </div>
    );
  }

  const tokenLimit = memData?.tokenLimit ?? null;
  const showUsageBadge = tokenLimit != null;

  return (
    <div
      role="region"
      aria-label={localize('com_ui_memories')}
      className="flex h-full w-full flex-col overflow-hidden pt-2"
    >
      {/* Sticky header: filter, partition, usage + toggle */}
      <div className="shrink-0 space-y-2 px-3 pb-2">
        {/* Header: Filter + Create Button */}
        <div className="flex items-center gap-2">
          <FilterInput
            inputId="memory-search"
            label={localize('com_ui_memories_filter')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            containerClassName="flex-1"
          />
          {hasCreateAccess && (
            <MemoryCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <OGDialogTrigger asChild>
                <TooltipAnchor
                  description={localize('com_ui_create_memory')}
                  side="bottom"
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0 bg-transparent"
                      aria-label={localize('com_ui_create_memory')}
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
              </OGDialogTrigger>
            </MemoryCreateDialog>
          )}
        </div>

        {/* Partition filter (only when agent-scoped memories exist) */}
        {partitionOptions && (
          <Dropdown
            value={activePartition}
            onChange={setPartitionFilter}
            options={partitionOptions}
            className="w-full"
            triggerClassName="w-full"
            ariaLabel={localize('com_ui_memories_partition_filter')}
            testId="memory-partition-filter"
          />
        )}

        {/* Controls: Usage Badge + Memory Toggle */}
        {(showUsageBadge || hasOptOutAccess) && (
          <div className="flex items-center justify-between">
            {/* Usage Badge */}
            {showUsageBadge && (
              <MemoryUsageBadge
                percentage={memData?.usagePercentage ?? 0}
                tokenLimit={tokenLimit}
                totalTokens={memData?.totalTokens ?? 0}
              />
            )}

            {/* Memory Toggle */}
            {hasOptOutAccess && (
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  showUsageBadge ? 'ml-auto' : 'w-full',
                  referenceSavedMemories && 'bg-surface-hover hover:bg-surface-hover',
                )}
                onClick={() => handleMemoryToggle(!referenceSavedMemories)}
                aria-label={localize('com_ui_use_memory')}
                aria-pressed={referenceSavedMemories}
                disabled={updateMemoryPreferencesMutation.isLoading}
              >
                <Checkbox
                  checked={referenceSavedMemories}
                  tabIndex={-1}
                  aria-hidden="true"
                  aria-label={localize('com_ui_use_memory')}
                  className="pointer-events-none"
                />
                {localize('com_ui_use_memory')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Only the list scrolls */}
      <PanelContent isLoading={isLoading} skeleton={<MemoryCardSkeleton />} className="px-3 pb-3">
        <MemoryList
          memories={filteredMemories}
          hasUpdateAccess={hasUpdateAccess}
          isFiltered={isFiltered}
        />
      </PanelContent>

      {user?.role === SystemRoles.ADMIN && (
        <PanelFooter>
          <AdminSettings />
        </PanelFooter>
      )}
    </div>
  );
}
