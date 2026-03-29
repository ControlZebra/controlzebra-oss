import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDiffTabs } from './useDiffTabs';
import type { L5XDiffTabDescriptor } from './types';

function makeTab(id: string, title: string): L5XDiffTabDescriptor {
  return {
    id,
    semanticId: id,
    kind: 'routine',
    title,
  };
}

describe('useDiffTabs', () => {
  it('restores the cached tab state when the cache key changes', () => {
    const { result, rerender } = renderHook(({ cacheKey }) => useDiffTabs(cacheKey), {
      initialProps: { cacheKey: 'diff-a' },
    });

    act(() => {
      result.current.openTab(makeTab('tab-a', 'Routine A'));
    });

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['tab-a']);
    expect(result.current.activeTabId).toBe('tab-a');

    rerender({ cacheKey: 'diff-b' });

    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();

    act(() => {
      result.current.openTab(makeTab('tab-b', 'Routine B'));
    });

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['tab-b']);
    expect(result.current.activeTabId).toBe('tab-b');

    rerender({ cacheKey: 'diff-a' });

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['tab-a']);
    expect(result.current.activeTabId).toBe('tab-a');
  });
});