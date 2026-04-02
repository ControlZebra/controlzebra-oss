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
import { toast } from 'sonner';
import { CheckForUpdate, StartUpdate } from '../../bindings/controlzebra/services/updateservice';
import type {
  AppUpdateProgress,
  UpdateCheckResult,
} from '../../bindings/controlzebra/services/models';
import { onEvent } from '../shared/runtime/events';

const DEFAULT_UPDATE_CHANNEL = 'stable';
const BACKGROUND_OPERATION_ID = 'app-update-background';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

interface CheckForUpdatesOptions {
  silent?: boolean;
}

interface UpdateContextValue {
  status: UpdateStatus;
  latestResult: UpdateCheckResult | null;
  progress: AppUpdateProgress | null;
  errorMessage: string | null;
  lastCheckedAt: string | null;
  isBusy: boolean;
  isUpdateAvailable: boolean;
  readyToInstall: boolean;
  checkForUpdates: (options?: CheckForUpdatesOptions) => Promise<UpdateCheckResult | null>;
  startUpdate: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

interface UpdateProviderProps {
  children: ReactNode;
}

function getAvailabilityStatus(result: UpdateCheckResult | null): UpdateStatus {
  if (!result) {
    return 'idle';
  }
  if (!result.available) {
    return 'up-to-date';
  }
  if (result.readyToInstall) {
    return 'ready';
  }
  return 'available';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unable to complete the update action.';
}

export function UpdateProvider({ children }: UpdateProviderProps): JSX.Element {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latestResult, setLatestResult] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const latestResultRef = useRef<UpdateCheckResult | null>(null);

  useEffect(() => {
    latestResultRef.current = latestResult;
  }, [latestResult]);

  const checkForUpdates = useCallback(async (options: CheckForUpdatesOptions = {}): Promise<UpdateCheckResult | null> => {
    const { silent = false } = options;

    if (!silent) {
      setStatus('checking');
      setErrorMessage(null);
    }

    try {
      const result = await CheckForUpdate(DEFAULT_UPDATE_CHANNEL);
      setLatestResult(result);
      setLastCheckedAt(new Date().toISOString());
      setErrorMessage(null);
      setStatus((currentStatus) => {
        if (currentStatus === 'downloading' || currentStatus === 'installing') {
          return currentStatus;
        }
        return getAvailabilityStatus(result);
      });
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      if (!silent) {
        setErrorMessage(message);
        setStatus('error');
        toast.error(message);
      }
      return null;
    }
  }, []);

  const startUpdate = useCallback(async (): Promise<void> => {
    setActionPending(true);
    setErrorMessage(null);
    setStatus((currentStatus) => {
      if (currentStatus === 'ready') {
        return 'installing';
      }
      return 'checking';
    });

    try {
      await StartUpdate({ channel: DEFAULT_UPDATE_CHANNEL });
    } catch (error) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      setStatus(getAvailabilityStatus(latestResultRef.current));
      toast.error(message);
      throw error;
    } finally {
      setActionPending(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onEvent('app-update:progress', (event: { data: AppUpdateProgress }) => {
      const update = event.data;
      setProgress(update);

      if (update.operationId === BACKGROUND_OPERATION_ID) {
        if (update.isComplete) {
          if (update.success) {
            setLatestResult((currentResult) => currentResult ? { ...currentResult, readyToInstall: true } : currentResult);
            setStatus('ready');
            setErrorMessage(null);
            return;
          }

          setStatus(getAvailabilityStatus(latestResultRef.current));
          return;
        }

        setStatus('downloading');
        setErrorMessage(null);
        return;
      }

      setActionPending(false);

      switch (update.phase) {
      case 'checking':
        setStatus('checking');
        break;
      case 'downloading':
        setStatus('downloading');
        break;
      case 'verifying':
      case 'launching-installer':
      case 'waiting-for-exit':
        setStatus('installing');
        break;
      case 'done':
        setStatus(update.success ? 'up-to-date' : getAvailabilityStatus(latestResultRef.current));
        break;
      case 'error':
        setStatus(getAvailabilityStatus(latestResultRef.current));
        break;
      default:
        break;
      }

      if (update.isComplete && !update.success) {
        setErrorMessage(update.error || update.message || 'The update could not be completed.');
      } else if (update.success) {
        setErrorMessage(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    void checkForUpdates({ silent: true });
  }, [checkForUpdates]);

  const value = useMemo<UpdateContextValue>(() => ({
    status,
    latestResult,
    progress,
    errorMessage,
    lastCheckedAt,
    isBusy: actionPending || status === 'checking' || status === 'downloading' || status === 'installing',
    isUpdateAvailable: Boolean(latestResult?.available),
    readyToInstall: Boolean(latestResult?.readyToInstall),
    checkForUpdates,
    startUpdate,
  }), [actionPending, checkForUpdates, errorMessage, lastCheckedAt, latestResult, progress, startUpdate, status]);

  return (
    <UpdateContext.Provider value={value}>
      {children}
    </UpdateContext.Provider>
  );
}

export function useAppUpdate(): UpdateContextValue {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useAppUpdate must be used within an UpdateProvider');
  }
  return context;
}