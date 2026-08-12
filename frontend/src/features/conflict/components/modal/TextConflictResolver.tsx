import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';

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
import type {
  ConflictRegionDecision,
  ConflictResolutionData,
  ConflictSide,
  TextConflictDraft,
} from '../../types';
import { composeConflictResolution } from '../../lib/conflict-composer';
import TextConflictBlock from './TextConflictBlock';

interface TextConflictResolverProps {
  data: ConflictResolutionData;
  draft: TextConflictDraft;
  disabled: boolean;
  applyError?: string;
  onDecision: (regionId: string, decision: ConflictRegionDecision) => void;
  onApply: (content: string) => void | Promise<void>;
}

function TextConflictResolver({
  data,
  draft,
  disabled,
  applyError,
  onDecision,
  onApply,
}: TextConflictResolverProps): JSX.Element {
  const [activeConflictIndex, setActiveConflictIndex] = useState(0);
  const [expandedRegionIds, setExpandedRegionIds] = useState<Set<string>>(() => new Set());
  const [pendingBulkSide, setPendingBulkSide] = useState<ConflictSide | null>(null);
  const [pendingRemoveRegionId, setPendingRemoveRegionId] = useState<string | null>(null);
  const conflictRegions = data.segments.flatMap((segment) => (
    segment.kind === 'conflict' ? [segment.conflict] : []
  ));
  const composed = composeConflictResolution({
    segments: data.segments,
    decisions: draft.decisions,
    newline: data.newline,
    hasFinalNewline: data.hasFinalNewline,
  });
  const undecidedRegionIds = new Set([
    ...composed.validation.unresolvedRegionIds,
    ...composed.validation.invalidDecisionIds,
  ]);
  const decidedCount = conflictRegions.length - undecidedRegionIds.size;
  const activeRegion = conflictRegions[activeConflictIndex];
  const activeSegmentIndex = activeRegion
    ? data.segments.findIndex((segment) => (
        segment.kind === 'conflict' && segment.conflict.id === activeRegion.id
      ))
    : -1;
  const segmentBefore = activeSegmentIndex > 0 ? data.segments[activeSegmentIndex - 1] : undefined;
  const segmentAfter = activeSegmentIndex >= 0 ? data.segments[activeSegmentIndex + 1] : undefined;
  const contextBefore = segmentBefore?.kind === 'context' ? segmentBefore.text : '';
  const contextAfter = segmentAfter?.kind === 'context' ? segmentAfter.text : '';
  const hasExistingChoices = Object.values(draft.decisions).some((decision) => decision.mode !== 'unresolved');

  useEffect(() => {
    setActiveConflictIndex((current) => Math.min(current, Math.max(conflictRegions.length - 1, 0)));
  }, [conflictRegions.length]);

  const applyBulkSide = (side: ConflictSide): void => {
    for (const region of conflictRegions) {
      onDecision(region.id, { mode: 'block', side });
    }
    setExpandedRegionIds(new Set());
    setPendingBulkSide(null);
  };

  const requestBulkSide = (side: ConflictSide): void => {
    if (hasExistingChoices) {
      setPendingBulkSide(side);
      return;
    }
    applyBulkSide(side);
  };

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

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-theme-default bg-theme-surface">
      <div className="shrink-0 border-b border-theme-default px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-blue-400" />
              <h3 className="text-theme-primary text-base font-medium">Resolve text conflicts</h3>
            </div>
            <p className="break-all text-sm text-theme-secondary">{data.path}</p>
          </div>
          <span className="shrink-0 text-xs text-theme-muted">
            {decidedCount} of {conflictRegions.length} decided
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-theme-muted">Choose one version for every conflict:</span>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => requestBulkSide('current')}>
            Use all Current
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => requestBulkSide('incoming')}>
            Use all Incoming
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="space-y-4">
          {activeRegion && (
            <>
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || activeConflictIndex === 0}
                  onClick={() => setActiveConflictIndex((current) => current - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous conflict
                </Button>
                <span className="text-xs font-medium text-theme-secondary">
                  Conflict {activeConflictIndex + 1} of {conflictRegions.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || activeConflictIndex === conflictRegions.length - 1}
                  onClick={() => setActiveConflictIndex((current) => current + 1)}
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

              <TextConflictBlock
                region={activeRegion}
                decision={draft.decisions[activeRegion.id] ?? { mode: 'unresolved' }}
                newline={data.newline || '\n'}
                disabled={disabled}
                expanded={expandedRegionIds.has(activeRegion.id)}
                onDecision={(decision) => onDecision(activeRegion.id, decision)}
                onExpandedChange={(expanded) => setRegionExpanded(activeRegion.id, expanded)}
                onRequestRemove={() => setPendingRemoveRegionId(activeRegion.id)}
              />

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
              {composed.ok ? composed.content : 'Choose Current or Incoming for every conflict to preview the resolved file.'}
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
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-theme-muted">The file is unchanged until you resolve it.</p>
          <Button
            type="button"
            disabled={disabled || !composed.ok}
            onClick={() => {
              if (composed.ok) {
                void onApply(composed.content);
              }
            }}
          >
            Resolve File
          </Button>
        </div>
      </div>

      <AlertDialog open={pendingBulkSide !== null} onOpenChange={(open) => !open && setPendingBulkSide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your section choices?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace every section choice with the {pendingBulkSide === 'current' ? 'Current' : 'Incoming'} version. You can review the result before resolving the file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my choices</AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              onClick={() => pendingBulkSide && applyBulkSide(pendingBulkSide)}
            >
              Replace choices
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

export default TextConflictResolver;