/**
 * useUpdateChecker - Hook for managing auto-update lifecycle.
 *
 * Responsibilities:
 * 1. Checks for updates on mount (after a startup delay)
 * 2. Listens for manual "Check for Updates" from Help menu
 * 3. Exposes state: updateInfo, checking, downloading, progress, error
 * 4. Exposes actions: checkForUpdates(), downloadAndInstall(), dismiss()
 * 5. Listens to `updater:progress` events from the backend during download
 *
 * State machine:
 *   [idle] → [checking] → [available] → [downloading] → [applying] → [restarting]
 *                       ↘ [up-to-date]
 *                       ↘ [error] → [idle] (retry)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Application, Events } from '@wailsio/runtime';
import {
  CheckForUpdate,
  DownloadUpdate,
  ApplyUpdate,
  GetCurrentVersion,
} from '../../bindings/controlzebra/services/updaterservice';
import type { UpdateInfo } from '../../bindings/controlzebra/services/models';

/** Delay before auto-check on startup (ms) — don't slow down app launch */
const AUTO_CHECK_DELAY_MS = 8_000;

/** How long to show "up to date" state before resetting (ms) */
const UP_TO_DATE_DISPLAY_MS = 4_000;

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'applying'
  | 'restarting'
  | 'error';

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export interface UseUpdateCheckerReturn {
  /** Current status of the update lifecycle */
  status: UpdateStatus;
  /** Update info when status is 'available', 'downloading', 'applying', or 'restarting' */
  updateInfo: UpdateInfo | null;
  /** Download progress when status is 'downloading' */
  progress: UpdateProgress | null;
  /** Error message when status is 'error' */
  error: string | null;
  /** Current app version */
  currentVersion: string;
  /** Whether the update modal is visible */
  isModalOpen: boolean;
  /** Trigger a manual update check */
  checkForUpdates: () => Promise<void>;
  /** Start download and apply flow */
  downloadAndInstall: () => Promise<void>;
  /** Open the update modal (e.g. to review details) */
  openModal: () => void;
  /** Dismiss the update notification / close modal */
  dismiss: () => void;
}

export function useUpdateChecker(): UseUpdateCheckerReturn {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Prevent multiple simultaneous operations
  const isOperating = useRef(false);

  // Fetch current version on mount
  useEffect(() => {
    GetCurrentVersion()
      .then((v) => setCurrentVersion(v))
      .catch(() => {/* non-critical */});
  }, []);

  // ── Check for updates ───────────────────────────────────────────────────

  const checkForUpdates = useCallback(async () => {
    if (isOperating.current) return;
    isOperating.current = true;

    setStatus('checking');
    setError(null);
    setProgress(null);

    try {
      const info = await CheckForUpdate();

      if (info) {
        setUpdateInfo(info);
        setStatus('available');
        // Auto-open modal for mandatory updates
        if (info.mandatory) {
          setIsModalOpen(true);
        }
      } else {
        // Up to date
        setUpdateInfo(null);
        setStatus('up-to-date');
        // Reset after a brief display
        setTimeout(() => {
          setStatus((prev) => (prev === 'up-to-date' ? 'idle' : prev));
        }, UP_TO_DATE_DISPLAY_MS);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus('error');
    } finally {
      isOperating.current = false;
    }
  }, []);

  // ── Download & install ─────────────────────────────────────────────────

  const downloadAndInstall = useCallback(async () => {
    if (!updateInfo || isOperating.current) return;
    isOperating.current = true;

    setStatus('downloading');
    setProgress({ downloaded: 0, total: updateInfo.size || 0, percent: 0 });
    setError(null);

    try {
      // Download the update — progress comes via Wails events
      const stagedPath = await DownloadUpdate(
        updateInfo.downloadURL,
        updateInfo.checksum,
      );

      // Apply the update (sidecar handles the rest)
      setStatus('applying');
      await ApplyUpdate(stagedPath);

      // Sidecar is now waiting for us to quit. Show "restarting" state.
      setStatus('restarting');

      // Give user a moment to see the "restarting" message, then close
      setTimeout(() => {
        void Application.Quit();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus('error');
    } finally {
      isOperating.current = false;
    }
  }, [updateInfo]);

  // ── Listen for download progress events from backend ───────────────────

  useEffect(() => {
    const unsubscribe = Events.On(
      'updater:progress',
      (event: { data?: UpdateProgress }) => {
        if (event.data) {
          const downloaded = Math.max(0, Number(event.data.downloaded) || 0);
          const reportedTotal = Number(event.data.total) || 0;
          const fallbackTotal = updateInfo?.size && updateInfo.size > 0 ? updateInfo.size : 0;
          const total = reportedTotal > 0 ? reportedTotal : fallbackTotal;

          let percent = Number(event.data.percent);
          if (!Number.isFinite(percent) || percent <= 0) {
            percent = total > 0 ? (downloaded / total) * 100 : 0;
          }
          percent = Math.max(0, Math.min(100, percent));

          setProgress({
            downloaded,
            total,
            percent,
          });
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [updateInfo?.size]);

  // ── Listen for manual check from Help menu ─────────────────────────────

  useEffect(() => {
    const unsubscribe = Events.On('updater:manual-check', () => {
      // If update is already known, just open the modal
      if (status === 'available' && updateInfo) {
        setIsModalOpen(true);
      } else {
        // Trigger a fresh check and open modal to show result
        setIsModalOpen(true);
        checkForUpdates();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [status, updateInfo, checkForUpdates]);

  // ── Auto-check on startup ─────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdates();
    }, AUTO_CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  // ── Modal controls ─────────────────────────────────────────────────────

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    setIsModalOpen(false);
    // Only reset status if we're in a dismissable state
    if (status === 'available' || status === 'error' || status === 'up-to-date') {
      // Keep update info around so the toast can re-appear later if needed
      if (status === 'error') {
        setStatus('idle');
        setError(null);
      }
    }
  }, [status]);

  return {
    status,
    updateInfo,
    progress,
    error,
    currentVersion,
    isModalOpen,
    checkForUpdates,
    downloadAndInstall,
    openModal,
    dismiss,
  };
}
