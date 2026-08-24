/**
 * MergeFinishModal - the reduced Finish flow behind Developer Mode.
 *
 * The compatibility check already ran in the background, so this modal never
 * starts a merge, never blocks on resolution, and never touches the open
 * project. It reports what the prepared result says and offers two decisions:
 * Finish, or Cancel Review.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, GitBranch, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { ICON_SIZES } from '../../../shared/constants';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
} from '../../../shared/ui';
import { useRepo, type MergeReviewDiffResult } from '../../../context';
import { useIntegrationSession } from '../../integration';
import SessionConflictResolver from '../../integration/components/SessionConflictResolver';
import MergeReviewPane from './modal/MergeReviewPane';

const iconSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

interface MergeFinishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MergeFinishModal({ open, onOpenChange }: MergeFinishModalProps): JSX.Element {
  const {
    repoPath,
    mergeReviewFiles,
    isLoadingMergeReviewFiles,
    loadMergeReviewFiles,
    loadMergeReviewFileDiff,
  } = useRepo();
  const {
    session,
    entries,
    isBusy,
    prepareReadiness,
    finish,
    cancelReview,
    refresh,
  } = useIntegrationSession();

  const [reviewFilePath, setReviewFilePath] = useState<string | null>(null);
  const [reviewDiff, setReviewDiff] = useState<MergeReviewDiffResult | null>(null);
  const [isLoadingReviewDiff, setIsLoadingReviewDiff] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [wasRefreshed, setWasRefreshed] = useState(false);

  const seenSessionIdRef = useRef('');
  const hasRequestedPreparationRef = useRef(false);

  const sourceOid = session?.sourceOid ?? '';
  const destinationOid = session?.destinationOid ?? '';
  const state = session?.state ?? '';

  useEffect(() => {
    if (!open) {
      hasRequestedPreparationRef.current = false;
      return;
    }
    if (session || hasRequestedPreparationRef.current) {
      return;
    }

    hasRequestedPreparationRef.current = true;
    void prepareReadiness();
  }, [open, session, prepareReadiness]);

  // A different review while the modal is open means a newer save replaced it,
  // and the decisions made against the old one are gone with it.
  useEffect(() => {
    if (!open) {
      seenSessionIdRef.current = session?.sessionId ?? '';
      setWasRefreshed(false);
      return;
    }

    const sessionId = session?.sessionId ?? '';
    if (sessionId && seenSessionIdRef.current && sessionId !== seenSessionIdRef.current) {
      setWasRefreshed(true);
    }
    seenSessionIdRef.current = sessionId;
  }, [open, session?.sessionId]);

  // Review is anchored to the exact revisions the result was built from, so it
  // shows what Finish will apply rather than what the branches look like now.
  useEffect(() => {
    if (!open || state === 'needs-decisions' || !sourceOid || !destinationOid) {
      return;
    }

    setReviewFilePath(null);
    setReviewDiff(null);
    void loadMergeReviewFiles(destinationOid, sourceOid);
  }, [open, state, sourceOid, destinationOid, loadMergeReviewFiles]);

  const handleReviewFile = useCallback(async (filePath: string): Promise<void> => {
    setReviewFilePath(filePath);
    setReviewDiff(null);
    setIsLoadingReviewDiff(true);

    try {
      setReviewDiff(await loadMergeReviewFileDiff(filePath, destinationOid, sourceOid));
    } finally {
      setIsLoadingReviewDiff(false);
    }
  }, [loadMergeReviewFileDiff, destinationOid, sourceOid]);

  const handleFinish = useCallback(async (): Promise<void> => {
    const result = await finish();
    if (!result) {
      return;
    }

    if (result.success) {
      toast.success(result.message);
      onOpenChange(false);
      return;
    }
    toast.error(result.error || result.message);
  }, [finish, onOpenChange]);

  const handleCancelReview = useCallback(async (): Promise<void> => {
    setShowCancelConfirm(false);
    const result = await cancelReview();
    if (result?.success) {
      toast.success(result.message);
      onOpenChange(false);
    }
  }, [cancelReview, onOpenChange]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    setWasRefreshed(false);
    await refresh();
  }, [refresh]);

  const conflictPaths = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const allReviewPaths = useMemo(() => mergeReviewFiles.map((file) => file.path), [mergeReviewFiles]);

  const canFinish = (state === 'ready' || state === 'blocked') && session?.hasResult === true;

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent size="6xl" className="h-[min(92vh,860px)] p-0 flex flex-col overflow-hidden">
          <div className="border-b border-theme-default px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <AlertDialogTitle className="text-xl">Finish this work</AlertDialogTitle>

                {session ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <div className="inline-flex min-w-0 items-center gap-2 text-theme-secondary">
                      <GitBranch style={iconSm} className="text-blue-400 shrink-0" />
                      <span className="truncate font-medium text-theme-primary">{session.sourceBranch}</span>
                    </div>
                    <ArrowRight style={iconSm} className="text-theme-muted shrink-0" />
                    <span className="truncate font-medium text-theme-primary">{session.targetBranch}</span>
                    {conflictPaths.length > 0 && (
                      <Badge variant="warning">
                        {conflictPaths.length === 1
                          ? '1 file needs a decision'
                          : `${conflictPaths.length} files need a decision`}
                      </Badge>
                    )}
                  </div>
                ) : null}

                <AlertDialogDescription className="mt-3">
                  {session?.message
                    ?? (isBusy
                      ? 'Checking your saved work against the shared project. You can keep working while this finishes.'
                      : 'Nothing has been checked yet. Save your changes, and we\u2019ll check them against the shared project.')}
                </AlertDialogDescription>
              </div>

              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
                <X style={iconSm} />
              </Button>
            </div>

            {wasRefreshed && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                <RefreshCw style={iconSm} className="mt-0.5 shrink-0" />
                <span>
                  Your saved work changed, so this check was redone and earlier choices were cleared.
                  Review the latest files before finishing.
                </span>
              </div>
            )}

            {session?.error && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertTriangle style={iconSm} className="mt-0.5 shrink-0" />
                <span>{session.error}</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden px-5 py-4">
            {state === 'needs-decisions' ? (
              <SessionConflictResolver />
            ) : session && sourceOid ? (
              <MergeReviewPane
                repoPath={repoPath}
                mergeReviewFiles={mergeReviewFiles}
                selectedReviewFiles={allReviewPaths}
                reviewFilePath={reviewFilePath}
                reviewDiff={reviewDiff}
                isLoadingMergeReviewFiles={isLoadingMergeReviewFiles}
                isLoadingReviewDiff={isLoadingReviewDiff}
                conflictFilePaths={conflictPaths}
                onReviewFile={handleReviewFile}
                selectable={false}
              />
            ) : isBusy ? (
              <div className="flex h-full items-center justify-center gap-3 text-sm text-theme-muted">
                <Loader2 style={iconSm} className="animate-spin" />
                <span>Checking your saved work</span>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-theme-muted">
                Nothing to review yet.
              </div>
            )}
          </div>

          <AlertDialogFooter className="border-t border-theme-default px-5 py-4">
            <Button variant="ghost" onClick={() => void handleRefresh()} disabled={isBusy}>
              <RefreshCw style={iconSm} />
              Refresh
            </Button>
            {session && (
              <Button variant="outline" onClick={() => setShowCancelConfirm(true)} disabled={isBusy}>
                Cancel review
              </Button>
            )}
            <Button onClick={() => void handleFinish()} disabled={!canFinish || isBusy}>
              {isBusy && <Loader2 style={iconSm} className="animate-spin" />}
              Finish
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this review?</AlertDialogTitle>
            <AlertDialogDescription>
              The choices you made for each file will be deleted. Nothing in your project or the
              shared project changes, and you can start a new check by saving again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleCancelReview()}>
              Cancel review
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default memo(MergeFinishModal);
