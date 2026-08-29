import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  ConflictRegionDecision,
  ConflictResolutionData,
  TextConflictDraft,
} from '../../types';
import { areConflictDecisionsComplete } from '../../types';
import { classifyL5XRegion } from '../../lib/l5x-region-classification';
import L5XVisualRegionCard from './L5XVisualRegionCard';
import TextConflictBlock from './TextConflictBlock';

interface L5XConflictResolverProps {
  data: ConflictResolutionData;
  draft: TextConflictDraft;
  disabled: boolean;
  applyError?: string;
  onDecision: (regionId: string, decision: ConflictRegionDecision) => void;
  onApply: () => void | Promise<void>;
  onResolveWholeFile: (strategy: ResolutionStrategy) => void | Promise<void>;
}

type PendingBulk = { kind: 'whole-file'; strategy: ResolutionStrategy };

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
  const conflictRegions = data.regions;

  const canResolve = useMemo(
    () => areConflictDecisionsComplete(conflictRegions, draft.decisions),
    [conflictRegions, draft.decisions],
  );

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(conflictRegions.length - 1, 0)));
  }, [conflictRegions.length]);

  const activeRegion = conflictRegions[activeIndex];
  // Only the visible region is classified; classifying every region up front parsed
  // XML for sections the user may never open.
  const activeClassification = useMemo(
    () => (activeRegion ? classifyL5XRegion(activeRegion, newline) : undefined),
    [activeRegion, newline],
  );
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

  const requestWholeFile = (strategy: ResolutionStrategy): void => {
    if (hasExistingChoices) {
      setPending({ kind: 'whole-file', strategy });
      return;
    }
    void onResolveWholeFile(strategy);
  };

  const confirmPending = (): void => {
    if (!pending) return;
    void onResolveWholeFile(pending.strategy);
    setPending(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-theme-default bg-theme-surface">
      <div className="shrink-0 border-b border-theme-default px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 break-all text-sm text-theme-secondary">{data.path}</p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => requestWholeFile('mine')}>
              Keep Current File
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => requestWholeFile('theirs')}>
              Keep Incoming File
            </Button>
          </div>
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
            </>
          )}
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
            disabled={disabled || !canResolve}
            onClick={() => {
              if (canResolve) {
                void onApply();
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
              {`This will discard your section choices and replace the complete file with the ${pending?.strategy === 'mine' ? 'Current' : 'Incoming'} version.`}
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
