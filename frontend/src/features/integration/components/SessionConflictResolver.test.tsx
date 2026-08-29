import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConflictRegionDecision, ConflictResolutionData } from '../../conflict/types';

const { sessionStore } = vi.hoisted(() => ({
  sessionStore: {
    current: {
      session: {
        sessionId: 'session-1',
        sourceBranch: 'feature/tank-logic',
        targetBranch: 'main',
      },
      entries: [{ path: 'logic/alpha.L5X', kind: 'both-modified' }],
      isBusy: false,
      loadConflictResolutionData: vi.fn(),
      resolveConflictWithDecisions: vi.fn(),
      resolveConflictWithSide: vi.fn(),
    },
  },
}));

vi.mock('../context/IntegrationSessionContext', () => ({
  useIntegrationSession: () => sessionStore.current,
}));

vi.mock('../../conflict/components/modal/ConflictQueue', () => ({
  default: (props: {
    resolutionData?: ConflictResolutionData;
    onSelectFile: (path: string) => void;
    onConflictDecision: (regionId: string, decision: ConflictRegionDecision) => void;
    onResolveWithDecisions: () => void;
    onResolve: (path: string, side: 'mine' | 'theirs') => void;
  }) => (
    <div>
      <span>{props.resolutionData?.path ?? 'No conflict loaded'}</span>
      <button type="button" onClick={() => props.onSelectFile('logic/alpha.L5X')}>Select conflict</button>
      <button
        type="button"
        onClick={() => props.onConflictDecision('region-1', { mode: 'block', side: 'current' })}
      >
        Choose current
      </button>
      <button type="button" onClick={props.onResolveWithDecisions}>Apply decisions</button>
      <button type="button" onClick={() => props.onResolve('logic/alpha.L5X', 'mine')}>Keep current file</button>
    </div>
  ),
}));

import SessionConflictResolver from './SessionConflictResolver';

const resolutionData: ConflictResolutionData = {
  success: true,
  path: 'logic/alpha.L5X',
  status: 'both-modified',
  eligible: true,
  base: { present: true },
  current: { present: true },
  incoming: { present: true },
  regions: [{
    id: 'region-1',
    current: ['current'],
    base: ['base'],
    incoming: ['incoming'],
    contextBefore: '',
    contextAfter: '',
  }],
  resolutionToken: 'token-1',
  hasFinalNewline: true,
};

describe('SessionConflictResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore.current.loadConflictResolutionData.mockResolvedValue(resolutionData);
    sessionStore.current.resolveConflictWithDecisions.mockResolvedValue({ success: true });
    sessionStore.current.resolveConflictWithSide.mockResolvedValue({ success: true });
  });

  it('loads the selected session conflict for the existing visualizer', async () => {
    render(<SessionConflictResolver />);

    await waitFor(() => {
      expect(sessionStore.current.loadConflictResolutionData).toHaveBeenCalledWith('logic/alpha.L5X');
      expect(screen.getByText('logic/alpha.L5X')).toBeInTheDocument();
    });
  });

  it('applies section decisions with the loaded resolution token', async () => {
    render(<SessionConflictResolver />);

    fireEvent.click(screen.getByRole('button', { name: 'Select conflict' }));
    await screen.findByText('logic/alpha.L5X');
    fireEvent.click(screen.getByRole('button', { name: 'Choose current' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply decisions' }));

    await waitFor(() => {
      expect(sessionStore.current.resolveConflictWithDecisions).toHaveBeenCalledWith(
        'logic/alpha.L5X',
        'token-1',
        { 'region-1': { mode: 'block', side: 'current' } },
      );
    });
  });

  it('applies a complete-file choice through the session side resolver', async () => {
    render(<SessionConflictResolver />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep current file' }));

    await waitFor(() => {
      expect(sessionStore.current.resolveConflictWithSide).toHaveBeenCalledWith(
        'logic/alpha.L5X',
        'mine',
      );
    });
  });
});