// Deloitte Custom Change: MemoryPanel's data/filter/pagination state extracted so the
// Settings tab's Memories panel can share it instead of duplicating it.
import { useMemo, useState, useEffect } from 'react';
import { matchSorter } from 'match-sorter';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TUserMemory } from 'librechat-data-provider';
import { useMemoriesQuery, useGetUserQuery } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';

export const MEMORY_PAGE_SIZE = 10;

/** Partition filter sentinels; any other value is an agent id */
const PARTITION_ALL = 'all';
const PARTITION_PERSONAL = 'personal';

function useMemoryAccess(permission: Permissions): boolean {
  return useHasAccess({ permissionType: PermissionTypes.MEMORIES, permission });
}

export default function useMemoryPanelState() {
  const localize = useLocalize();
  const { data: userData } = useGetUserQuery();
  const { data: memData, isLoading } = useMemoriesQuery();
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [partitionFilter, setPartitionFilter] = useState(PARTITION_ALL);

  const hasReadAccess = useMemoryAccess(Permissions.READ);
  const hasUpdateAccess = useMemoryAccess(Permissions.UPDATE);
  const hasCreateAccess = useMemoryAccess(Permissions.CREATE);
  const hasOptOutAccess = useMemoryAccess(Permissions.OPT_OUT);

  const memories: TUserMemory[] = useMemo(() => memData?.memories ?? [], [memData]);

  const partitionOptions = useMemo(() => {
    const agentsById = new Map<string, string>();
    for (const memory of memories) {
      if (memory.agentId != null && !agentsById.has(memory.agentId)) {
        agentsById.set(memory.agentId, memory.agentName ?? memory.agentId);
      }
    }
    if (agentsById.size === 0) {
      return null;
    }
    return [
      { value: PARTITION_ALL, label: localize('com_ui_memories_all') },
      { value: PARTITION_PERSONAL, label: localize('com_ui_memories_personal') },
      ...[...agentsById.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [memories, localize]);

  /** Falls back to "all" when the selected partition no longer exists
   *  (e.g. the last memory of that agent was deleted), so the panel never
   *  gets stuck filtering on a removed partition. */
  const activePartition = useMemo(() => {
    if (partitionFilter === PARTITION_ALL || partitionFilter === PARTITION_PERSONAL) {
      return partitionFilter;
    }
    return partitionOptions?.some((option) => option.value === partitionFilter)
      ? partitionFilter
      : PARTITION_ALL;
  }, [partitionOptions, partitionFilter]);

  const filteredMemories = useMemo(() => {
    const matchesPartition = (memory: TUserMemory): boolean => {
      if (activePartition === PARTITION_ALL) {
        return true;
      }
      if (activePartition === PARTITION_PERSONAL) {
        return memory.agentId == null;
      }
      return memory.agentId === activePartition;
    };
    const partitionMemories = memories.filter(matchesPartition);
    return matchSorter(partitionMemories, searchQuery.trim(), {
      keys: ['key', 'value'],
    });
  }, [memories, searchQuery, activePartition]);

  // Deloitte Custom Change: true whenever the list is narrowed by search or partition, so
  // callers can tell "no memories match this filter" apart from "no memories at all" —
  // partition alone (with an empty search) narrows the list just as much as search does.
  const isFiltered = searchQuery.trim().length > 0 || activePartition !== PARTITION_ALL;

  const totalPages = Math.ceil(filteredMemories.length / MEMORY_PAGE_SIZE);

  const currentRows = useMemo(() => {
    return filteredMemories.slice(pageIndex * MEMORY_PAGE_SIZE, (pageIndex + 1) * MEMORY_PAGE_SIZE);
  }, [filteredMemories, pageIndex]);

  // Reset page when search or partition changes
  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery, activePartition]);

  // Deloitte Custom Change: clamp pageIndex when totalPages shrinks (e.g. deleting the
  // last item on a later page), so the panel doesn't render an empty page while earlier
  // pages still have data.
  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, Math.max(totalPages - 1, 0)));
  }, [totalPages]);

  return {
    userData,
    memData,
    isLoading,
    memories,
    filteredMemories,
    isFiltered,
    currentRows,
    pageIndex,
    setPageIndex,
    totalPages,
    searchQuery,
    setSearchQuery,
    partitionOptions,
    activePartition,
    setPartitionFilter,
    hasReadAccess,
    hasUpdateAccess,
    hasCreateAccess,
    hasOptOutAccess,
  };
}
