import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../context', () => ({
  useRepo: () => ({ progressModal: { isOpen: false }, handleProgressComplete: vi.fn() }),
  useLayout: () => ({ explorerMergeModalOpen: false, setExplorerMergeModalOpen: vi.fn() }),
}));
vi.mock('../../shared/runtime/window', () => ({ isWindowsDesktop: () => true }));
vi.mock('../../shared/ui', () => ({ Toaster: () => null, ProgressModal: () => null }));
vi.mock('../../shared/ui/RecoveryBanner', () => ({ default: () => null }));
vi.mock('./TitleBar', () => ({ default: () => <div data-testid="separate-title-bar" /> }));
vi.mock('./TopBar', () => ({ default: () => <header data-testid="unified-top-bar" /> }));
vi.mock('./ActivityBar', () => ({ default: () => null }));
vi.mock('./Sidebar', () => ({ default: () => <aside data-testid="sidebar" /> }));
vi.mock('./MainArea', () => ({ default: () => null }));
vi.mock('./StatusBar', () => ({ default: () => null }));
vi.mock('./NonGitFolderPromptModal', () => ({ default: () => null }));
vi.mock('./AdditionalPackagesModal', () => ({ default: () => null }));
vi.mock('./GitIdentityPromptModal', () => ({ default: () => null }));
vi.mock('./DefaultBranchSyncConfirmModal', () => ({ default: () => null }));

import AppLayout from './AppLayout';

describe('Windows app shell', () => {
  it('mounts one top/title bar above the sidebar', () => {
    render(<AppLayout />);
    const bar = screen.getByTestId('unified-top-bar');
    expect(screen.queryByTestId('separate-title-bar')).not.toBeInTheDocument();
    expect(bar.parentElement).toBe(screen.getByTestId('sidebar').parentElement?.parentElement);
    expect(
      bar.compareDocumentPosition(screen.getByTestId('sidebar')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
