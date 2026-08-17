/**
 * IntegrationSessionContext - the isolated readiness review for the open project.
 *
 * The backend prepares a real merge in a workspace of its own after each save,
 * so this provider only ever mirrors what the backend reports. It holds a
 * session id and repository-relative paths; the workspace location is a backend
 * detail that never reaches the frontend.
 *
 * Gated on Developer Mode. With the flag off this provider makes no backend
 * calls at all and reads as if no review exists.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  CancelSession,
  FinishSession,
  GetSessionConflicts,
  ListSessions,
} from '../../../../bindings/controlzebra/services/integrationsessionservice';
import type {
  ConflictQueueEntry,
  IntegrationSessionSnapshot,
  OperationResult,
  SessionConflictSnapshot,
} from '../../../../bindings/controlzebra/services/models';
import { useLayout, useRepo } from '../../../context';
import { onEvent } from '../../../shared/runtime/events';

/** States a review can still be acted on from. */
export const SESSION_NEEDS_DECISIONS = 'needs-decisions';

/** States that mean the review is over and a fresh one must be prepared. */
const FINISHED_STATES = new Set(['completed', 'cancelled', 'obsolete']);

interface IntegrationSessionContextValue {
  /** True when the session path is the active source of conflict decisions. */
  enabled: boolean;
  /** The review for the open project, or null when there isn't one. */
  session: IntegrationSessionSnapshot | null;
  /** Files this review is asking about. Empty unless it needs decisions. */
  entries: ConflictQueueEntry[];
  /** Set when the last scan failed. */
  error: string | null;
  /** True while Finish or Cancel Review is running. */
  isBusy: boolean;
  /** Apply the prepared result to the shared project. */
  finish: () => Promise<OperationResult | null>;
  /** Discard the review. Neither branch changes. */
  cancelReview: () => Promise<OperationResult | null>;
  /** Re-read the review and its files from the backend. */
  refresh: () => Promise<void>;
}

const EMPTY_ENTRIES: ConflictQueueEntry[] = [];

/**
 * Without a provider there is no review, so surfaces that read this render
 * nothing rather than crashing the view that hosts them.
 */
const NO_SESSION: IntegrationSessionContextValue = {
  enabled: false,
  session: null,
  entries: EMPTY_ENTRIES,
  error: null,
  isBusy: false,
  finish: async () => null,
  cancelReview: async () => null,
  refresh: async () => {},
};

const IntegrationSessionContext = createContext<IntegrationSessionContextValue>(NO_SESSION);

interface IntegrationSessionProviderProps {
  children: ReactNode;
}

export function IntegrationSessionProvider({ children }: IntegrationSessionProviderProps): JSX.Element {
  const { repoPath } = useRepo();
  const { developerModeEnabled } = useLayout();
  const enabled = developerModeEnabled && Boolean(repoPath);

  const [session, setSession] = useState<IntegrationSessionSnapshot | null>(null);
  const [conflicts, setConflicts] = useState<SessionConflictSnapshot | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Event handlers need the session identity as it is now, not as it was when
  // the handler was created.
  const sessionIdRef = useRef('');
  const scannedAtRef = useRef(0);

  const applySession = useCallback((incoming: IntegrationSessionSnapshot | null): void => {
    const current = incoming?.sessionId && !FINISHED_STATES.has(incoming.state) ? incoming : null;

    if (current?.sessionId !== sessionIdRef.current) {
      sessionIdRef.current = current?.sessionId ?? '';
      scannedAtRef.current = 0;
      setConflicts(null);
    }
    setSession(current);
  }, []);

  /**
   * Applies a scan if it belongs to the review we are showing and is newer than
   * the one already held, which drops late and duplicated events without
   * needing to know which call or event produced them.
   */
  const applyConflicts = useCallback((incoming: SessionConflictSnapshot | null): void => {
    if (!incoming?.sessionId || incoming.sessionId !== sessionIdRef.current) {
      return;
    }
    if (incoming.scannedAt <= scannedAtRef.current) {
      return;
    }
    scannedAtRef.current = incoming.scannedAt;
    setConflicts(incoming);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || !repoPath) {
      applySession(null);
      return;
    }

    try {
      const sessions = await ListSessions(repoPath);
      // The store lists oldest first, so the newest live review is the last one.
      const current = [...sessions].reverse().find((entry) => !FINISHED_STATES.has(entry.state)) ?? null;
      applySession(current);

      if (current?.state === SESSION_NEEDS_DECISIONS) {
        applyConflicts(await GetSessionConflicts(current.sessionId));
      }
    } catch {
      // The backend holds the authoritative state and any error worth showing
      // arrives on a snapshot, so a failed read needs no local handling.
    }
  }, [enabled, repoPath, applySession, applyConflicts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = onEvent(
      'integrationSession:changed',
      (event: { data: IntegrationSessionSnapshot }) => {
        // A snapshot for a review we don't know about means a new one was
        // prepared, so re-read rather than guessing it belongs to this project.
        if (event.data?.sessionId && event.data.sessionId === sessionIdRef.current) {
          applySession(event.data);
          return;
        }
        void refresh();
      },
    );
    return () => unsubscribe();
  }, [enabled, applySession, refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = onEvent(
      'integrationSession:conflicts',
      (event: { data: SessionConflictSnapshot }) => applyConflicts(event.data),
    );
    return () => unsubscribe();
  }, [enabled, applyConflicts]);

  const runSessionAction = useCallback(
    async (action: (sessionId: string) => Promise<OperationResult>): Promise<OperationResult | null> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return null;
      }

      setIsBusy(true);
      try {
        return await action(sessionId);
      } catch {
        return null;
      } finally {
        setIsBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  const finish = useCallback(
    () => runSessionAction(FinishSession),
    [runSessionAction],
  );

  const cancelReview = useCallback(
    () => runSessionAction(CancelSession),
    [runSessionAction],
  );

  const value = useMemo<IntegrationSessionContextValue>(() => {
    const needsDecisions = session?.state === SESSION_NEEDS_DECISIONS;

    return {
      enabled,
      session,
      entries: needsDecisions && conflicts ? conflicts.entries : EMPTY_ENTRIES,
      error: conflicts?.error ? conflicts.error : null,
      isBusy,
      finish,
      cancelReview,
      refresh,
    };
  }, [enabled, session, conflicts, isBusy, finish, cancelReview, refresh]);

  return (
    <IntegrationSessionContext.Provider value={value}>
      {children}
    </IntegrationSessionContext.Provider>
  );
}

export function useIntegrationSession(): IntegrationSessionContextValue {
  return useContext(IntegrationSessionContext);
}
