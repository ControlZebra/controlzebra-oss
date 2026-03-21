import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repoStore } = vi.hoisted(() => ({
  repoStore: {
    current: null as Record<string, unknown> | null,
    listeners: new Set<() => void>(),
  },
}));

vi.mock('../../../context', () => ({
  useRepo: () => {
    const { useSyncExternalStore } = require('react') as typeof import('react');

    return useSyncExternalStore(
      (listener) => {
        repoStore.listeners.add(listener);
        return () => repoStore.listeners.delete(listener);
      },
      () => repoStore.current,
      () => repoStore.current,
    );
  },
}));

vi.mock('./SidebarCommitPanel', () => ({
  default: ({ currentBranch }: { currentBranch: string }) => (
    <div data-testid="sidebar-commit-panel">Commit panel for {currentBranch}</div>
  ),
}));

vi.mock('./ExplorerStatusPanel', () => ({
  default: ({ onOpenCombineChanges }: { onOpenCombineChanges: () => void }) => (
    <button type="button" onClick={onOpenCombineChanges}>
      Open merge modal
    </button>
  ),
}));

vi.mock('../../auth/components/GitHubDeviceFlowModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Device flow modal</div> : null),
}));

vi.mock('../../merge/components/ExplorerMergeModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Merge modal is open</div> : null),
}));

import ExplorerView from './ExplorerView';

function createRepoValue(overrides: Record<string, unknown> = {}) {
  return {
    repoPath: '/tmp/repo',
    repoInfo: { isRepo: true },
    repoStatus: {
      changedFiles: [],
      ahead: 0,
      hasUpstream: true,
      totalLocalCommits: 0,
      branch: 'feature/tank-logic',
    },
    startTracking: vi.fn(),
    installRequiredPackages: vi.fn(),
    commitChanges: vi.fn(),
    branchAndCommit: vi.fn(),
    discardFileChanges: vi.fn(),
    syncRepo: vi.fn(),
    rewindToLastSnapshot: vi.fn(),
    isLoading: false,
    isCommitting: false,
    isSyncing: false,
    operationInProgress: false,
    hasRemote: true,
    refreshRemotes: vi.fn(),
    gitInstalled: true,
    lfsInstalled: true,
    isInstallingPackages: false,
    ghInstalled: true,
    ghAuthStatus: null,
    startGitHubLogin: vi.fn(),
    publishToGitHub: vi.fn(),
    loadUserOrganizations: vi.fn(),
    ...overrides,
  };
}

describe('ExplorerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoStore.listeners.clear();
    repoStore.current = null;
  });

  it('keeps the merge modal mounted when merge start changes the panel to has changes', () => {
    repoStore.current = createRepoValue();

    render(<ExplorerView />);

    fireEvent.click(screen.getByRole('button', { name: 'Open merge modal' }));

    expect(screen.getByText('Merge modal is open')).toBeInTheDocument();

    act(() => {
      repoStore.current = createRepoValue({
        repoStatus: {
          changedFiles: [{ path: 'logic/alpha.L5X', staged: false, status: 'modified' }],
          ahead: 0,
          hasUpstream: true,
          totalLocalCommits: 0,
          branch: 'main',
        },
      });
      repoStore.listeners.forEach((listener) => listener());
    });

    expect(screen.getByTestId('sidebar-commit-panel')).toHaveTextContent('Commit panel for main');
    expect(screen.getByText('Merge modal is open')).toBeInTheDocument();
  });
});