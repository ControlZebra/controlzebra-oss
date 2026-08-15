import { ChevronLeft, ChevronRight, FileWarning } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { l5xConflictVisualAdapter } from 'ladder-visualizer';
import type { VisualConflictFallback, VisualConflictRegion } from 'ladder-visualizer';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '../../../../shared/ui';
import type { ResolutionStrategy } from '../../../../domain/repo/context/RepoContext.types';
import type {
  ConflictRegion,
  ConflictRegionDecision,
  ConflictResolutionData,
  ConflictSide,
  TextConflictDraft,
} from '../../types';
import { composeConflictResolution } from '../../lib/conflict-composer';
import L5XVisualRegionCard from './L5XVisualRegionCard';
import TextConflictBlock from './TextConflictBlock';

interface L5XConflictResolverProps {
  data: ConflictResolutionData;
  draft: TextConflictDraft;
  disabled: boolean;
  applyError?: string;
  onDecision: (regionId: string, decision: ConflictRegionDecision) => void;
  onApply: (content: string) => void | Promise<void>;
  onResolveWholeFile: (strategy: ResolutionStrategy) => void | Promise<void>;
}

type PendingBulk = { kind: 'shortcut'; side: ConflictSide } | { kind: 'whole-file'; strategy: ResolutionStrategy };

function joinRegionLines(lines: readonly string[], newline: string): string {
  return lines.join(newline);
}

function classifyRegion(
  region: ConflictRegion,
  newline: string,
): VisualConflictRegion | VisualConflictFallback {
  return l5xConflictVisualAdapter.classifyRegion(
    joinRegionLines(region.current, newline),
    joinRegionLines(region.incoming, newline),
  );
}

function isVisualRegion(result: VisualConflictRegion | VisualConflictFallback): result is VisualConflictRegion {
  return 'kind' in result;
}

function L5XConflictResolver({
  data,
  draft,
  disabled,
  applyError,
  onDecision,
  onApply,
  onResolveWholeFile,
}: L5XConflictResolverProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedRegionIds, setExpandedRegionIds] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<PendingBulk | null>(null);
  const [pendingRemoveRegionId, setPendingRemoveRegionId] = useState<string | null>(null);

  const newline = data.newline || '\n';
  const conflictRegions = useMemo(
    () => data.segments.flatMap((segment) => (segment.kind === 'conflict' ? [segment.conflict] : [])),
    [data.segments],
  );
  const classifications = useMemo(
    () => conflictRegions.map((region) => classifyRegion(region, newline)),
    [conflictRegions, newline],
  );

  const composed = composeConflictResolution({
    segments: data.segments,
    decisions: draft.decisions,
    newline: data.newline,
    hasFinalNewline: data.hasFinalNewline,
  });
  const documentValid = composed.ok ? l5xConflictVisualAdapter.validateComposedDocument(composed.content).valid : false;
  const undecidedCount = composed.ok
    ? 0
    : composed.validation.unresolvedRegionIds.length + composed.validation.invalidDecisionIds.length;
  const decidedCount = conflictRegions.length - undecidedCount;

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(conflictRegions.length - 1, 0)));
  }, [conflictRegions.length]);

  const activeRegion = conflictRegions[activeIndex];
  const activeClassification = classifications[activeIndex];
  const activeSegmentIndex = activeRegion
    ? data.segments.findIndex((segment) => segment.kind === 'conflict' && segment.conflict.id === activeRegion.id)
    : -1;
  const segmentBefore = activeSegmentIndex > 0 ? data.segments[activeSegmentIndex - 1] : undefined;
  const segmentAfter = activeSegmentIndex >= 0 ? data.segments[activeSegmentIndex + 1] : undefined;
  const contextBefore = segmentBefore?.kind === 'context' ? segmentBefore.text : '';
  const contextAfter = segmentAfter?.kind === 'context' ? segmentAfter.text : '';
  const hasExistingChoices = Object.values(draft.decisions).some((decision) => decision.mode !== 'unresolved');

  const setRegionExpanded = (regionId: string, expanded: boolean): void => {
    setExpandedRegionIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(regionId);
      } else {
        next.delete(regionId);
      }
      return next;
    });
  };

  const applyBulkSide = (side: ConflictSide): void => {
    for (const region of conflictRegions) {
      onDecision(region.id, { mode: 'block', side });
    }
    setExpandedRegionIds(new Set());
  };

  const requestBulkSide = (side: ConflictSide): void => {
    if (hasExistingChoices) {
      setPending({ kind: 'shortcut', side });
      return;
    }
    applyBulkSide(side);
  };

  const requestWholeFile = (strategy: ResolutionStrategy): void => {
    if (hasExistingChoices) {
      setPending({ kind: 'whole-file', strategy });
      return;
    }
    void onResolveWholeFile(strategy);
  };

  const confirmPending = (): void => {
    if (!pending) return;
    if (pending.kind === 'shortcut') {
      applyBulkSide(pending.side);
    } else {
      void onResolveWholeFile(pending.strategy);
    }
    setPending(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-theme-default bg-theme-surface">
      <div className="shrink-0 border-b border-theme-default px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <FileWarning className="h-4 w-4 shrink-0 text-blue-400" />
              <h3 className="text-theme-primary text-base font-medium">Resolve ladder logic conflicts</h3>
            </div>
            <p className="break-all text-sm text-theme-secondary">{data.path}</p>
          </div>
          <span className="shrink-0 text-xs text-theme-muted">
            {decidedCount} of {conflictRegions.length} decided
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-theme-muted">Section shortcuts:</span>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => requestBulkSide('current')}>
            Use all Current
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => requestBulkSide('incoming')}>
            Use all Incoming
          </Button>
          <span className="ml-2 text-xs text-theme-muted">Or keep the complete file:</span>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => requestWholeFile('mine')}>
            Keep Current File
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => requestWholeFile('theirs')}>
            Keep Incoming File
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="space-y-4">
          {activeRegion && activeClassification && (
            <>
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || activeIndex === 0}
                  onClick={() => setActiveIndex((current) => current - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous conflict
                </Button>
                <span className="text-xs font-medium text-theme-secondary">
                  Conflict {activeIndex + 1} of {conflictRegions.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || activeIndex === conflictRegions.length - 1}
                  onClick={() => setActiveIndex((current) => current + 1)}
                >
                  Next conflict
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              {contextBefore && (
                <pre aria-label="Context before conflict" className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md border border-theme-default bg-theme-base p-3 font-mono text-xs text-theme-muted">
                  {contextBefore}
                </pre>
              )}

              {isVisualRegion(activeClassification) ? (
                <L5XVisualRegionCard
                  regionId={activeRegion.id}
                  region={activeClassification}
                  decision={draft.decisions[activeRegion.id] ?? { mode: 'unresolved' }}
                  disabled={disabled}
                  onDecision={(decision) => onDecision(activeRegion.id, decision)}
                />
              ) : (
                <TextConflictBlock
                  region={activeRegion}
                  decision={draft.decisions[activeRegion.id] ?? { mode: 'unresolved' }}
                  newline={newline}
                  disabled={disabled}
                  expanded={expandedRegionIds.has(activeRegion.id)}
                  onDecision={(decision) => onDecision(activeRegion.id, decision)}
                  onExpandedChange={(expanded) => setRegionExpanded(activeRegion.id, expanded)}
                  onRequestRemove={() => setPendingRemoveRegionId(activeRegion.id)}
                />
              )}

              {contextAfter && (
                <pre aria-label="Context after conflict" className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md border border-theme-default bg-theme-base p-3 font-mono text-xs text-theme-muted">
                  {contextAfter}
                </pre>
              )}
            </>
          )}

          <section>
            <h4 className="mb-2 text-sm font-medium text-theme-primary">Resolved file preview</h4>
            <pre
              aria-label="Resolved file preview"
              className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-theme-default bg-theme-base p-4 font-mono text-xs text-theme-secondary"
            >
              {composed.ok ? composed.content : 'Choose a version for every conflict to preview the resolved file.'}
            </pre>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-theme-default px-5 py-4">
        {applyError && (
          <p role="alert" className="mb-3 whitespace-pre-line text-sm text-red-400">
            {applyError}
          </p>
        )}
        {composed.ok && !documentValid && (
          <p role="alert" className="mb-3 text-sm text-amber-400">
            The resolved file is not a valid L5X document yet. Adjust your choices or keep the complete file.
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-theme-muted">The file is unchanged until you resolve it.</p>
          <Button
            type="button"
            disabled={disabled || !composed.ok || !documentValid}
            onClick={() => {
              if (composed.ok && documentValid) {
                void onApply(composed.content);
              }
            }}
          >
            Resolve File
          </Button>
        </div>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your section choices?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === 'whole-file'
                ? `This will discard your section choices and replace the complete file with the ${pending.strategy === 'mine' ? 'Current' : 'Incoming'} version.`
                : `This will replace every section choice with the ${pending?.kind === 'shortcut' && pending.side === 'current' ? 'Current' : 'Incoming'} version. You can review the result before resolving the file.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my choices</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>
              {pending?.kind === 'whole-file' ? 'Replace file' : 'Replace choices'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingRemoveRegionId !== null} onOpenChange={(open) => !open && setPendingRemoveRegionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this section?</AlertDialogTitle>
            <AlertDialogDescription>
              This section will be empty in the resolved file. You can still review the complete result before resolving it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep this section</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemoveRegionId) {
                  onDecision(pendingRemoveRegionId, { mode: 'remove' });
                  setRegionExpanded(pendingRemoveRegionId, false);
                  setPendingRemoveRegionId(null);
                }
              }}
            >
              Remove section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default L5XConflictResolver;
