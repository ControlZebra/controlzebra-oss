import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionStore } = vi.hoisted(() => ({
  sessionStore: { current: null as { state: string } | null },
}));

vi.mock('../../context', () => ({
  useRepo: () => ({
    mergeState: { inMerge: true, stuckType: 'merge' },
    isResolvingConflict: false,
    abortCurrentOperation: vi.fn(),
    removeAllStaleLocks: vi.fn(),
  }),
  useLayout: () => ({
    setActiveView: vi.fn(),
    setSidebarCollapsed: vi.fn(),
    openExplorerMergeModal: vi.fn(),
  }),
}));

vi.mock('../../features/integration', () => ({
  useIntegrationSession: () => ({ session: sessionStore.current }),
}));

vi.mock('../../widgets/layout/BranchModal', () => ({ default: () => null }));

import RecoveryBanner from './RecoveryBanner';

describe('RecoveryBanner integration-session ownership', () => {
  beforeEach(() => {
    sessionStore.current = null;
  });

  it('shows generic recovery for an unowned merge', () => {
    render(<RecoveryBanner />);
    expect(screen.getByText('Merge in Progress')).toBeInTheDocument();
  });

  it('suppresses generic recovery when the persisted session owns the merge', () => {
    sessionStore.current = { state: 'needs-decisions' };
    render(<RecoveryBanner />);
    expect(screen.queryByText('Merge in Progress')).not.toBeInTheDocument();
  });
});
