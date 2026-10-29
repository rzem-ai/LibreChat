// Deloitte Custom Change: tests for the shared memory-panel state hook — regression
// coverage for the pagination-clamp and partition-aware isFiltered fixes.
import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { TUserMemory } from 'librechat-data-provider';
import useMemoryPanelState, { MEMORY_PAGE_SIZE } from '../useMemoryPanelState';

const buildMemories = (count: number, agentId?: string): TUserMemory[] =>
  Array.from({ length: count }, (_, i) => ({
    key: `key-${i}`,
    value: `value-${i}`,
    updated_at: new Date(2026, 0, i + 1).toISOString(),
    ...(agentId ? { agentId, agentName: 'Agent' } : {}),
  }));

let mockMemories: TUserMemory[] = buildMemories(0);

jest.mock('~/data-provider', () => ({
  useMemoriesQuery: jest.fn(() => ({
    data: { memories: mockMemories, totalTokens: 0, tokenLimit: null, usagePercentage: null },
    isLoading: false,
  })),
  useGetUserQuery: jest.fn(() => ({ data: undefined })),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockImplementation(() => (key: string) => key),
  useHasAccess: jest.fn(() => true),
}));

describe('useMemoryPanelState', () => {
  beforeEach(() => {
    mockMemories = buildMemories(0);
  });

  describe('isFiltered', () => {
    it('is false with no search query and the "all" partition selected', () => {
      mockMemories = buildMemories(3);
      const { result } = renderHook(() => useMemoryPanelState());
      expect(result.current.isFiltered).toBe(false);
    });

    it('is true once a search query is entered', () => {
      mockMemories = buildMemories(3);
      const { result } = renderHook(() => useMemoryPanelState());
      act(() => result.current.setSearchQuery('key-1'));
      expect(result.current.isFiltered).toBe(true);
    });

    it('is true when a non-"all" partition is selected, even with an empty search', () => {
      mockMemories = buildMemories(2, 'agent-1');
      const { result } = renderHook(() => useMemoryPanelState());
      act(() => result.current.setPartitionFilter('agent-1'));
      expect(result.current.searchQuery).toBe('');
      expect(result.current.isFiltered).toBe(true);
    });
  });

  describe('whitespace-only search', () => {
    it('keeps every memory and does not count as filtered', () => {
      mockMemories = buildMemories(3);
      const { result } = renderHook(() => useMemoryPanelState());
      act(() => result.current.setSearchQuery('   '));
      expect(result.current.filteredMemories).toHaveLength(3);
      expect(result.current.isFiltered).toBe(false);
    });
  });

  describe('pagination', () => {
    it('resets to the first page when the search query changes', () => {
      mockMemories = buildMemories(25);
      const { result } = renderHook(() => useMemoryPanelState());
      act(() => result.current.setPageIndex(2));
      expect(result.current.pageIndex).toBe(2);

      act(() => result.current.setSearchQuery('key'));
      expect(result.current.pageIndex).toBe(0);
    });

    it('clamps pageIndex when totalPages shrinks after a delete', () => {
      mockMemories = buildMemories(25);
      const { result, rerender } = renderHook(() => useMemoryPanelState());

      act(() => result.current.setPageIndex(2));
      expect(result.current.pageIndex).toBe(2);
      expect(result.current.currentRows.length).toBeGreaterThan(0);

      // Simulate the memories query re-fetching after enough deletions to drop a page.
      mockMemories = buildMemories(15);
      rerender();

      expect(result.current.totalPages).toBe(Math.ceil(15 / MEMORY_PAGE_SIZE));
      expect(result.current.pageIndex).toBe(result.current.totalPages - 1);
      expect(result.current.currentRows.length).toBeGreaterThan(0);
    });

    it('never clamps pageIndex below zero when every memory is deleted', () => {
      mockMemories = buildMemories(5);
      const { result, rerender } = renderHook(() => useMemoryPanelState());

      mockMemories = buildMemories(0);
      rerender();

      expect(result.current.pageIndex).toBe(0);
      expect(result.current.totalPages).toBe(0);
    });
  });
});
