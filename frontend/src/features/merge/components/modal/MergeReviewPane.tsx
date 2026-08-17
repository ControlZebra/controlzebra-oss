import { memo, useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Files, Loader2 } from 'lucide-react';

import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../../shared/ui';
import type { MergeReviewDiffResult, MergeReviewFile } from '../../../../context';
import MergeReviewPreview from './MergeReviewPreview';
import {
  formatMergeReviewFileLabel,
  getMergeReviewSelectedFilePath,
} from './mergeReviewShared';

interface MergeReviewPaneProps {
  repoPath?: string | null;
  mergeReviewFiles: MergeReviewFile[];
  selectedReviewFiles: string[];
  reviewFilePath: string | null;
  reviewDiff: MergeReviewDiffResult | null;
  isLoadingMergeReviewFiles: boolean;
  isLoadingReviewDiff: boolean;
  conflictFilePaths?: string[];
  onToggleReviewFile?: (filePath: string) => void;
  onToggleAllReviewFiles?: () => void;
  onReviewFile: (filePath: string) => Promise<void>;
  showToolbar?: boolean;
  showFrame?: boolean;
  /** False when Finish applies the whole result, so picking files means nothing. */
  selectable?: boolean;
}

interface MergeReviewFileListProps {
  mergeReviewFiles: MergeReviewFile[];
  selectedReviewFiles: string[];
  reviewFilePath: string;
  isLoadingMergeReviewFiles: boolean;
  conflictFilePaths?: string[];
  title?: string;
  description?: string;
  selectable?: boolean;
  onToggleReviewFile?: (filePath: string) => void;
  onToggleAllReviewFiles?: () => void;
  onReviewFile: (filePath: string) => void;
}

export function MergeReviewFileList({
  mergeReviewFiles,
  selectedReviewFiles,
  reviewFilePath,
  isLoadingMergeReviewFiles,
  conflictFilePaths = [],
  title = 'Selected files',
  description = 'These are the files that will be included when you continue the merge.',
  selectable = true,
  onToggleReviewFile,
  onToggleAllReviewFiles,
  onReviewFile,
}: MergeReviewFileListProps): JSX.Element {
  const selectedReviewSet = useMemo(() => new Set(selectedReviewFiles), [selectedReviewFiles]);
  const conflictFileSet = useMemo(() => new Set(conflictFilePaths), [conflictFilePaths]);
  const allReviewFilesSelected = useMemo(
    () => mergeReviewFiles.length > 0 && selectedReviewFiles.length === mergeReviewFiles.length,
    [mergeReviewFiles.length, selectedReviewFiles.length],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-theme-default px-4 py-2.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-theme-primary text-sm font-medium">{title}</p>
          <p className="text-theme-secondary text-xs">{description}</p>
        </div>
        <Badge variant="outline">{selectedReviewFiles.length}/{mergeReviewFiles.length}</Badge>
      </div>

      {selectable && (
        <label className="flex items-center gap-2 px-4 py-2.5 border-b border-theme-default text-sm text-theme-secondary">
          <input
            type="checkbox"
            checked={allReviewFilesSelected}
            onChange={onToggleAllReviewFiles}
            className="rounded border-theme-default bg-theme-base"
          />
          Select all files
        </label>
      )}

      <div className="flex-1 overflow-auto p-2 space-y-1">
        {isLoadingMergeReviewFiles ? (
          <div className="h-full min-h-40 flex items-center justify-center text-theme-muted text-sm gap-2">
            <Loader2 className="animate-spin h-4 w-4" />
            Loading files...
          </div>
        ) : mergeReviewFiles.map((file) => {
          const isSelected = selectedReviewSet.has(file.path);
          const isPreviewing = reviewFilePath === file.path;
          const hasConflict = conflictFileSet.has(file.path);

          return (
            <div
              key={file.path}
              className={`w-full rounded-lg px-3 py-2 transition-colors ${
                isPreviewing
                  ? 'bg-theme-muted/10'
                  : 'hover:bg-theme-muted/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {selectable && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleReviewFile?.(file.path)}
                    className="mt-1 rounded border-theme-default bg-theme-base"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-theme-primary text-sm break-all">{formatMergeReviewFileLabel(file)}</p>
                    {hasConflict && <Badge variant="warning">Needs a choice</Badge>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant={isPreviewing ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => onReviewFile(file.path)}
                  className="shrink-0"
                  aria-label={`Preview ${formatMergeReviewFileLabel(file)}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MergeReviewPane({
  repoPath,
  mergeReviewFiles,
  selectedReviewFiles,
  reviewFilePath,
  reviewDiff,
  isLoadingMergeReviewFiles,
  isLoadingReviewDiff,
  conflictFilePaths,
  onToggleReviewFile,
  onToggleAllReviewFiles,
  onReviewFile,
  showToolbar = true,
  showFrame = true,
  selectable = true,
}: MergeReviewPaneProps): JSX.Element {
  const [isFilesOpen, setIsFilesOpen] = useState(false);

  const activeReviewPath = useMemo(
    () => getMergeReviewSelectedFilePath(reviewFilePath, reviewDiff) || mergeReviewFiles[0]?.path || '',
    [mergeReviewFiles, reviewDiff, reviewFilePath],
  );

  const currentReviewIndex = useMemo(
    () => mergeReviewFiles.findIndex((file) => file.path === activeReviewPath),
    [activeReviewPath, mergeReviewFiles],
  );

  const currentReviewFile = currentReviewIndex >= 0 ? mergeReviewFiles[currentReviewIndex] : null;
  const hasPreviousFile = currentReviewIndex > 0;
  const hasNextFile = currentReviewIndex >= 0 && currentReviewIndex < mergeReviewFiles.length - 1;

  const handleReviewSelection = useCallback((filePath: string, shouldCloseFiles = false): void => {
    if (shouldCloseFiles) {
      setIsFilesOpen(false);
    }

    void onReviewFile(filePath);
  }, [onReviewFile]);

  const handleStepReviewFile = useCallback((direction: -1 | 1): void => {
    const nextIndex = currentReviewIndex + direction;
    const nextFile = mergeReviewFiles[nextIndex];

    if (!nextFile) {
      return;
    }

    void onReviewFile(nextFile.path);
  }, [currentReviewIndex, mergeReviewFiles, onReviewFile]);

  const currentFileLabel = currentReviewFile
    ? formatMergeReviewFileLabel(currentReviewFile)
    : mergeReviewFiles.length > 0
      ? 'Choose a file'
      : 'No files to review';

  return (
    <div className={showFrame ? 'flex h-full min-h-[28rem] flex-col overflow-hidden rounded-xl border border-theme-default bg-theme-surface/40' : 'flex h-full min-h-0 flex-col overflow-hidden'}>
      {showToolbar && (
        <div className="border-b border-theme-default px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleStepReviewFile(-1)}
              disabled={!hasPreviousFile || isLoadingReviewDiff}
              aria-label="Previous file"
              className="h-8 w-8 px-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleStepReviewFile(1)}
              disabled={!hasNextFile || isLoadingReviewDiff}
              aria-label="Next file"
              className="h-8 w-8 px-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>

            <div className="min-w-0 rounded-lg border border-theme-default bg-theme-base/60 px-3 py-1.5">
              <span className="block truncate text-sm font-medium text-theme-primary">{currentFileLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Popover open={isFilesOpen} onOpenChange={setIsFilesOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Files className="h-3.5 w-3.5" />
                  Selected files
                  <Badge variant="outline">{mergeReviewFiles.length}</Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] p-0">
                <MergeReviewFileList
                  mergeReviewFiles={mergeReviewFiles}
                  selectedReviewFiles={selectedReviewFiles}
                  reviewFilePath={activeReviewPath}
                  isLoadingMergeReviewFiles={isLoadingMergeReviewFiles}
                  conflictFilePaths={conflictFilePaths}
                  selectable={selectable}
                  onToggleReviewFile={onToggleReviewFile}
                  onToggleAllReviewFiles={onToggleAllReviewFiles}
                  onReviewFile={(filePath) => handleReviewSelection(filePath, true)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-theme-base/20">
        <MergeReviewPreview
          repoPath={repoPath}
          reviewFilePath={reviewFilePath}
          reviewDiff={reviewDiff}
          isLoadingReviewDiff={isLoadingReviewDiff}
        />
      </div>
    </div>
  );
}

export default memo(MergeReviewPane);