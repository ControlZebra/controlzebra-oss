import { memo, useEffect, useMemo, type CSSProperties } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  FileWarning,
  Hash,
  Info,
  MessageSquare,
  User,
} from 'lucide-react';

import { ICON_SIZES } from '../../../../shared/constants';
import { Badge, Card, CardContent } from '../../../../shared/ui';
import type {
  ConflictSidesInfo,
  ConflictedFile,
  ResolutionStrategy,
} from '../../../../domain/repo/context/RepoContext.types';

const iconSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconLg: CSSProperties = { width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 };

const CONFLICT_STATUS_LABELS: Record<ConflictedFile['status'], string> = {
  'both-modified': 'Both changed',
  'both-added': 'Both added',
  'both-deleted': 'Both deleted',
  'deleted-by-us': 'Deleted on your branch',
  'deleted-by-them': 'Deleted on destination',
};

interface MergeConflictQueueProps {
  conflictedFiles: ConflictedFile[];
  selectedConflictFile: string | null;
  fileResolutions: Record<string, ResolutionStrategy>;
  isResolvingConflict: boolean;
  conflictSidesInfo: ConflictSidesInfo | null;
  sourceBranch: string;
  targetBranch: string;
  onSelectFile: (path: string | null) => void;
  onResolve: (filePath: string, strategy: ResolutionStrategy) => void | Promise<void>;
}

interface ConflictResolutionOptionCardProps {
  title: string;
  subtitle: string;
  branchName: string;
  variant: 'mine' | 'theirs';
  disabled: boolean;
  commitInfo?: ConflictSidesInfo['ours'];
  onClick: () => void;
}

function ConflictResolutionOptionCard({
  title,
  subtitle,
  branchName,
  variant,
  disabled,
  commitInfo,
  onClick,
}: ConflictResolutionOptionCardProps): JSX.Element {
  const isMine = variant === 'mine';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-full flex-col rounded-xl border p-4 text-left transition-colors ${
        isMine
          ? 'border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10'
          : 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-theme-primary text-sm font-medium">{title}</p>
          <p className="mt-1 text-theme-secondary text-sm">{subtitle}</p>
        </div>
        <Badge variant={isMine ? 'info' : 'warning'}>{branchName}</Badge>
      </div>

      {commitInfo ? (
        <div className="flex flex-1 flex-col gap-2 rounded-lg border border-theme-default bg-theme-base/50 p-3">
          <div className="flex items-center gap-2 text-xs text-theme-secondary">
            <User style={{ width: 12, height: 12 }} className="shrink-0" />
            <span className="truncate">{commitInfo.author}</span>
          </div>
          {commitInfo.message && (
            <div className="flex items-start gap-2 text-xs text-theme-secondary">
              <MessageSquare style={{ width: 12, height: 12 }} className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">{commitInfo.message}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-theme-muted">
            {commitInfo.hash && (
              <span className="inline-flex items-center gap-1">
                <Hash style={{ width: 11, height: 11 }} className="shrink-0" />
                {commitInfo.hash.slice(0, 7)}
              </span>
            )}
            {commitInfo.date && (
              <span className="inline-flex items-center gap-1">
                <Clock style={{ width: 11, height: 11 }} className="shrink-0" />
                {commitInfo.date}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center rounded-lg border border-dashed border-theme-default px-3 py-4 text-xs text-theme-muted">
          Commit details are not available for this choice.
        </div>
      )}

      <div className="mt-3 border-t border-theme-default pt-3">
        <div className="flex items-start gap-2 text-xs">
          <Info
            style={{ width: 11, height: 11 }}
            className={`shrink-0 mt-0.5 ${isMine ? 'text-blue-300' : 'text-amber-300'}`}
          />
          <span className={isMine ? 'text-blue-200/90' : 'text-amber-200/90'}>
            {isMine
              ? 'Incoming changes for this file will be discarded.'
              : 'Your current branch version for this file will be discarded.'}
          </span>
        </div>
      </div>
    </button>
  );
}

function MergeConflictQueue({
  conflictedFiles,
  selectedConflictFile,
  fileResolutions,
  isResolvingConflict,
  conflictSidesInfo,
  sourceBranch,
  targetBranch,
  onSelectFile,
  onResolve,
}: MergeConflictQueueProps): JSX.Element {
  const unresolvedConflicts = useMemo(
    () => conflictedFiles.filter((file) => !fileResolutions[file.path]),
    [conflictedFiles, fileResolutions],
  );

  const selectedUnresolvedConflict = useMemo(
    () => unresolvedConflicts.find((file) => file.path === selectedConflictFile) || null,
    [selectedConflictFile, unresolvedConflicts],
  );

  const activeConflict = useMemo(
    () => selectedUnresolvedConflict || unresolvedConflicts[0] || null,
    [selectedUnresolvedConflict, unresolvedConflicts],
  );

  useEffect(() => {
    if (conflictedFiles.length === 0) {
      return;
    }

    if (unresolvedConflicts.length === 0) {
      if (selectedConflictFile !== null) {
        onSelectFile(null);
      }
      return;
    }

    if (activeConflict && activeConflict.path !== selectedConflictFile) {
      onSelectFile(activeConflict.path);
    }
  }, [
    activeConflict,
    conflictedFiles.length,
    onSelectFile,
    selectedConflictFile,
    unresolvedConflicts,
  ]);
  const activeConflictStatus = activeConflict ? CONFLICT_STATUS_LABELS[activeConflict.status] : 'Needs review';
  const activeDecisionIndex = activeConflict
    ? conflictedFiles.findIndex((file) => file.path === activeConflict.path) + 1
    : 0;

  if (!activeConflict) {
    return (
      <div className="h-full min-h-[28rem] flex items-center justify-center">
        <div className="text-center max-w-md">
          <CheckCircle2 style={iconLg} className="mx-auto mb-4 text-green-400" />
          <p className="text-theme-primary text-lg font-medium mb-2">All decisions are complete</p>
          <p className="text-theme-secondary text-sm">You can finish the merge from the footer below.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] h-full min-h-[28rem]">
      <Card className="min-h-0">
        <CardContent className="p-0 h-full flex flex-col">
          <div className="border-b border-theme-default px-4 py-3">
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-theme-primary text-sm font-medium">Decision queue</p>
              <Badge variant="warning">{unresolvedConflicts.length} waiting</Badge>
            </div>
            <p className="text-theme-secondary text-xs">{activeDecisionIndex} of {conflictedFiles.length} decisions</p>
          </div>

          <div className="flex-1 overflow-auto p-2 space-y-1">
            {conflictedFiles.map((file, index) => {
              const isCurrent = file.path === activeConflict.path;
              const isResolved = Boolean(fileResolutions[file.path]);
              const resolution = fileResolutions[file.path];

              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => onSelectFile(file.path)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    isCurrent
                      ? 'border-blue-500/40 bg-blue-500/5'
                      : isResolved
                        ? 'border-green-500/20 bg-green-500/5'
                        : 'border-transparent hover:border-theme-default hover:bg-theme-muted/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-theme-primary text-sm break-all">{index + 1}. {file.path}</p>
                      <p className="mt-1 text-theme-muted text-xs">{CONFLICT_STATUS_LABELS[file.status]}</p>
                    </div>
                    <Badge variant={isCurrent ? 'info' : isResolved ? 'success' : 'outline'}>
                      {isCurrent ? 'Current' : isResolved ? 'Resolved' : 'Waiting'}
                    </Badge>
                  </div>
                  {resolution && (
                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-theme-secondary">
                      <Check style={{ width: 12, height: 12 }} className="text-green-400" />
                      Keeping {resolution === 'mine' ? sourceBranch : targetBranch}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 min-w-0">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle style={iconSm} className="text-amber-400 shrink-0" />
                  <p className="text-theme-primary text-lg font-medium">Choose a version to keep</p>
                </div>
                <p className="text-theme-primary text-sm break-all">{activeConflict.path}</p>
                <p className="mt-1 text-theme-secondary text-sm">{activeConflictStatus}. Pick the version that should stay in the merged result.</p>
              </div>
              <Badge variant="outline">{activeDecisionIndex} of {conflictedFiles.length}</Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ConflictResolutionOptionCard
                title="Keep Mine"
                subtitle="Use the version from your current branch for this file."
                branchName={sourceBranch}
                variant="mine"
                disabled={isResolvingConflict}
                commitInfo={conflictSidesInfo?.ours}
                onClick={() => {
                  void onResolve(activeConflict.path, 'mine');
                }}
              />
              <ConflictResolutionOptionCard
                title="Keep Theirs"
                subtitle="Use the version from the destination branch for this file."
                branchName={targetBranch}
                variant="theirs"
                disabled={isResolvingConflict}
                commitInfo={conflictSidesInfo?.theirs}
                onClick={() => {
                  void onResolve(activeConflict.path, 'theirs');
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <FileWarning style={iconSm} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-theme-primary text-sm font-medium mb-1">What happens next</p>
                <p className="text-theme-secondary text-sm">
                  After you choose a version, ControlZebra moves straight to the next unresolved file.
                  When every file has a decision, the modal switches to the finish step automatically.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default memo(MergeConflictQueue);