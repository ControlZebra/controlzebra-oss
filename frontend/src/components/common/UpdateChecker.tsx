/**
 * UpdateChecker - Auto-update notification UI.
 *
 * Renders invisibly by default. When an update is available:
 * 1. Shows a sonner toast notification (non-blocking).
 * 2. If user clicks "View Details" or opens via Help menu → shows a modal dialog.
 * 3. Modal shows version, release notes, progress bar, and install/dismiss buttons.
 *
 * State machine (driven by useUpdateChecker hook):
 *   idle → checking → available → downloading (progress) → applying → restarting
 *                   ↘ up-to-date
 *                   ↘ error → retry
 */
import { memo, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Download,
  RefreshCw,
  X,
  Loader2,
  CheckCircle,
  ArrowDownToLine,
  Sparkles,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  Button,
  Progress,
} from '../ui';
import { useUpdateChecker } from '../../hooks/useUpdateChecker';
import type { UpdateStatus } from '../../hooks/useUpdateChecker';

const iconSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

// ── Toast notification (shown when update is available) ─────────────────

/** Show a toast when an update is first detected */
function useUpdateToast(
  status: UpdateStatus,
  version: string | undefined,
  openModal: () => void,
) {
  const hasShownToast = useRef(false);

  useEffect(() => {
    if (status === 'available' && version && !hasShownToast.current) {
      hasShownToast.current = true;

      toast.info(`Update available: v${version}`, {
        description: 'A new version of ControlZebra is ready.',
        duration: 12_000,
        action: {
          label: 'View Details',
          onClick: openModal,
        },
      });
    }

    // Reset so we can show toast again for future updates
    if (status === 'idle') {
      hasShownToast.current = false;
    }
  }, [status, version, openModal]);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatReleaseNotes(notes: string): string {
  // Simple markdown-ish rendering: strip leading ##, keep line breaks
  return notes
    .replace(/^#{1,3}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .trim();
}

// ── Modal content by status ─────────────────────────────────────────────

interface ModalBodyProps {
  status: UpdateStatus;
  updateInfo: { version: string; releaseNotes: string; size: number; releaseDate: string; mandatory: boolean } | null;
  progress: { downloaded: number; total: number; percent: number } | null;
  error: string | null;
  currentVersion: string;
}

function ModalBody({ status, updateInfo, progress, error, currentVersion }: ModalBodyProps) {
  switch (status) {
    case 'checking':
      return (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm text-theme-secondary">Checking for updates…</p>
          <p className="text-xs text-theme-tertiary">Current version: v{currentVersion}</p>
        </div>
      );

    case 'up-to-date':
      return (
        <div className="flex flex-col items-center gap-3 py-6">
          <CheckCircle className="h-8 w-8 text-green-400" />
          <p className="text-sm text-theme-primary font-medium">You're up to date!</p>
          <p className="text-xs text-theme-tertiary">Version v{currentVersion} is the latest.</p>
        </div>
      );

    case 'available':
      return (
        <div className="flex flex-col gap-4">
          {/* Version badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-400">
              <Sparkles style={iconSm} />
              v{updateInfo?.version}
            </span>
            {updateInfo?.mandatory && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400">
                Required
              </span>
            )}
            {updateInfo?.size ? (
              <span className="text-xs text-theme-tertiary">
                {formatBytes(updateInfo.size)}
              </span>
            ) : null}
          </div>

          {/* Release notes */}
          {updateInfo?.releaseNotes ? (
            <div className="rounded-md border border-theme-default bg-theme-base p-3 max-h-48 overflow-y-auto">
              <p className="text-xs font-medium text-theme-secondary mb-2">What's new:</p>
              <pre className="text-xs text-theme-primary whitespace-pre-wrap font-sans leading-relaxed">
                {formatReleaseNotes(updateInfo.releaseNotes)}
              </pre>
            </div>
          ) : null}

          {/* Current version */}
          <p className="text-xs text-theme-tertiary">
            Current version: v{currentVersion}
          </p>
        </div>
      );

    case 'downloading':
      return (
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-blue-400 animate-bounce" />
            <p className="text-sm text-theme-primary font-medium">Downloading update…</p>
          </div>
          <Progress value={progress?.percent ?? 0} />
          <div className="flex justify-between text-xs text-theme-tertiary">
            <span>{progress ? formatBytes(progress.downloaded) : '0 B'}</span>
            <span>{progress?.percent?.toFixed(0) ?? 0}%</span>
            <span>{progress ? formatBytes(progress.total) : '—'}</span>
          </div>
        </div>
      );

    case 'applying':
      return (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm text-theme-primary font-medium">Installing update…</p>
          <p className="text-xs text-theme-tertiary">Preparing to restart.</p>
        </div>
      );

    case 'restarting':
      return (
        <div className="flex flex-col items-center gap-3 py-6">
          <RotateCw className="h-8 w-8 animate-spin text-green-400" />
          <p className="text-sm text-theme-primary font-medium">Restarting ControlZebra…</p>
          <p className="text-xs text-theme-tertiary">The app will relaunch momentarily.</p>
        </div>
      );

    case 'error':
      return (
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-theme-primary font-medium">Update failed</p>
              <p className="text-xs text-theme-secondary mt-1 break-words">
                {error || 'An unexpected error occurred.'}
              </p>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ── Footer actions by status ────────────────────────────────────────────

interface ModalActionsProps {
  status: UpdateStatus;
  mandatory: boolean;
  onDownloadAndInstall: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}

function ModalActions({ status, mandatory, onDownloadAndInstall, onDismiss, onRetry }: ModalActionsProps) {
  switch (status) {
    case 'checking':
      return (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Cancel
        </Button>
      );

    case 'up-to-date':
      return (
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          Close
        </Button>
      );

    case 'available':
      return (
        <>
          {!mandatory && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Remind Me Later
            </Button>
          )}
          <Button size="sm" onClick={onDownloadAndInstall}>
            <Download style={iconSm} />
            Download & Install
          </Button>
        </>
      );

    case 'downloading':
    case 'applying':
    case 'restarting':
      // No actions while in progress
      return null;

    case 'error':
      return (
        <>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw style={iconSm} />
            Retry
          </Button>
        </>
      );

    default:
      return null;
  }
}

// ── Main component ──────────────────────────────────────────────────────

function UpdateChecker() {
  const {
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
  } = useUpdateChecker();

  // Show toast when update is available
  useUpdateToast(status, updateInfo?.version, openModal);

  const handleRetry = useCallback(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  // Prevent closing during active operations
  const canDismiss =
    status !== 'downloading' &&
    status !== 'applying' &&
    status !== 'restarting' &&
    !(status === 'available' && updateInfo?.mandatory);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && canDismiss) {
        dismiss();
      }
    },
    [canDismiss, dismiss],
  );

  // Only render the dialog when it should be visible
  // The toast is handled independently by sonner
  const showModal =
    isModalOpen &&
    (status === 'checking' ||
      status === 'up-to-date' ||
      status === 'available' ||
      status === 'downloading' ||
      status === 'applying' ||
      status === 'restarting' ||
      status === 'error');

  return (
    <AlertDialog open={showModal} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="flex items-center justify-between">
            <AlertDialogTitle className="text-base">
              {status === 'checking'
                ? 'Checking for Updates'
                : status === 'up-to-date'
                  ? 'Up to Date'
                  : status === 'available'
                    ? 'Update Available'
                    : status === 'downloading'
                      ? 'Downloading Update'
                      : status === 'applying' || status === 'restarting'
                        ? 'Installing Update'
                        : status === 'error'
                          ? 'Update Error'
                          : 'Software Update'}
            </AlertDialogTitle>
            {canDismiss && (
              <button
                onClick={dismiss}
                className="text-theme-tertiary hover:text-theme-primary transition-colors rounded p-0.5"
                aria-label="Close"
              >
                <X style={iconSm} />
              </button>
            )}
          </div>
          <AlertDialogDescription className="sr-only">
            Software update dialog for ControlZebra.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-5 pb-2">
          <ModalBody
            status={status}
            updateInfo={updateInfo}
            progress={progress}
            error={error}
            currentVersion={currentVersion}
          />
        </div>

        <AlertDialogFooter>
          <ModalActions
            status={status}
            mandatory={updateInfo?.mandatory ?? false}
            onDownloadAndInstall={downloadAndInstall}
            onDismiss={dismiss}
            onRetry={handleRetry}
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(UpdateChecker);
