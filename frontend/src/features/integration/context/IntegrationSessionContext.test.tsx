import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConflictQueueEntry,
  IntegrationSessionSnapshot,
  OperationResult,
  SessionConflictSnapshot,
} from '../../../../bindings/controlzebra/services/models';
import { IntegrationSessionProvider, useIntegrationSession } from './IntegrationSessionContext';

const { repoStore, layoutStore, bindings, eventBus } = vi.hoisted(() => ({
  repoStore: { current: { repoPath: '/repo' } },
  layoutStore: { current: { developerModeEnabled: true } },
  bindings: {
    ListSessions: vi.fn(),
    GetSessionConflicts: vi.fn(),
    FinishSession: vi.fn(),
    CancelSession: vi.fn(),
  },
  eventBus: { handlers: new Map<string, (event: { data: unknown }) => void>() },
}));

vi.mock('../../../context', () => ({
  useRepo: () => repoStore.current,
  useLayout: () => layoutStore.current,
}));

vi.mock('../../../../bindings/controlzebra/services/integrationsessionservice', () => bindings);

vi.mock('../../../shared/runtime/events', () => ({
  onEvent: (name: string, handler: (event: { data: unknown }) => void) => {
    eventBus.handlers.set(name, handler);
    return () => eventBus.handlers.delete(name);
  },
}));

function session(state: string, sessionId = 'abc'): IntegrationSessionSnapshot {
  return new IntegrationSessionSnapshot({ sessionId, state, targetBranch: 'main' });
}

function conflicts(
  scannedAt: number,
  paths: string[],
  sessionId = 'abc',
): SessionConflictSnapshot {
  return new SessionConflictSnapshot({
    sessionId,
    scannedAt,
    entries: paths.map((path) => new ConflictQueueEntry({ path })),
  });
}

function Probe(): JSX.Element {
  const { session: current, entries } = useIntegrationSession();
  return (
    <div>
      <span data-testid="state">{current?.state ?? ''}</span>
      <span data-testid="paths">{entries.map((entry) => entry.path).join(',')}</span>
    </div>
  );
}

async function renderProvider(): Promise<void> {
  await act(async () => {
    render(
      <IntegrationSessionProvider>
        <Probe />
      </IntegrationSessionProvider>,
    );
  });
}

describe('IntegrationSessionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventBus.handlers.clear();
    repoStore.current = { repoPath: '/repo' };
    layoutStore.current = { developerModeEnabled: true };
    bindings.ListSessions.mockResolvedValue([session('needs-decisions')]);
    bindings.GetSessionConflicts.mockResolvedValue(conflicts(10, ['a.txt']));
    bindings.FinishSession.mockResolvedValue(new OperationResult({ success: true }));
    bindings.CancelSession.mockResolvedValue(new OperationResult({ success: true }));
  });

  it('stays silent with developer mode off', async () => {
    layoutStore.current = { developerModeEnabled: false };
    await renderProvider();

    expect(bindings.ListSessions).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('');
    expect(screen.getByTestId('paths')).toHaveTextContent('');
  });

  it('adopts the live review and the files it is asking about', async () => {
    await renderProvider();

    expect(bindings.ListSessions).toHaveBeenCalledWith('/repo');
    expect(screen.getByTestId('state')).toHaveTextContent('needs-decisions');
    expect(screen.getByTestId('paths')).toHaveTextContent('a.txt');
  });

  it('ignores a review that is already over', async () => {
    bindings.ListSessions.mockResolvedValue([session('completed'), session('obsolete', 'def')]);
    await renderProvider();

    expect(screen.getByTestId('state')).toHaveTextContent('');
    expect(bindings.GetSessionConflicts).not.toHaveBeenCalled();
  });

  it('applies newer scans and drops stale ones and those for another review', async () => {
    await renderProvider();

    await act(async () => {
      eventBus.handlers.get('integrationSession:conflicts')?.({ data: conflicts(20, ['b.txt']) });
    });
    expect(screen.getByTestId('paths')).toHaveTextContent('b.txt');

    await act(async () => {
      eventBus.handlers.get('integrationSession:conflicts')?.({ data: conflicts(15, ['old.txt']) });
    });
    expect(screen.getByTestId('paths')).toHaveTextContent('b.txt');

    await act(async () => {
      eventBus.handlers.get('integrationSession:conflicts')?.({ data: conflicts(30, ['other.txt'], 'zzz') });
    });
    expect(screen.getByTestId('paths')).toHaveTextContent('b.txt');
  });

  it('re-reads when a state change arrives for a review it does not know', async () => {
    await renderProvider();
    bindings.ListSessions.mockResolvedValue([session('ready', 'def')]);

    await act(async () => {
      eventBus.handlers.get('integrationSession:changed')?.({ data: session('ready', 'def') });
    });

    expect(screen.getByTestId('state')).toHaveTextContent('ready');
    expect(screen.getByTestId('paths')).toHaveTextContent('');
  });

  it('finishes and cancels the review it is showing', async () => {
    function Actions(): JSX.Element {
      const { finish, cancelReview } = useIntegrationSession();
      return (
        <div>
          <button type="button" onClick={() => void finish()}>finish</button>
          <button type="button" onClick={() => void cancelReview()}>cancel</button>
        </div>
      );
    }

    await act(async () => {
      render(
        <IntegrationSessionProvider>
          <Actions />
        </IntegrationSessionProvider>,
      );
    });

    await act(async () => {
      screen.getByText('finish').click();
    });
    expect(bindings.FinishSession).toHaveBeenCalledWith('abc');

    await act(async () => {
      screen.getByText('cancel').click();
    });
    expect(bindings.CancelSession).toHaveBeenCalledWith('abc');
  });
});
