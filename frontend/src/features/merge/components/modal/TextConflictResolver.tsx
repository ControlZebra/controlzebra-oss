import { Check, FileText } from 'lucide-react';

import { Button } from '../../../../shared/ui';
import type {
  ConflictRegionDecision,
  ConflictResolutionData,
  TextConflictDraft,
} from '../../types';
import { composeConflictResolution } from '../../lib/conflict-composer';

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
  const conflictRegions = data.segments.flatMap((segment) => (
    segment.kind === 'conflict' ? [segment.conflict] : []
  ));
  const composed = composeConflictResolution({
    segments: data.segments,
    decisions: draft.decisions,
    newline: data.newline,
    hasFinalNewline: data.hasFinalNewline,
  });
  const decidedCount = conflictRegions.length - composed.validation.unresolvedRegionIds.length;

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
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="space-y-4">
          {conflictRegions.map((region, index) => {
            const decision = draft.decisions[region.id];
            const selectedSide = decision?.mode === 'block' ? decision.side : undefined;

            return (
              <section key={region.id} className="rounded-lg border border-theme-default bg-theme-base/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-medium text-theme-primary">Conflict {index + 1}</h4>
                  {selectedSide && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-400">
                      <Check className="h-3.5 w-3.5" />
                      {selectedSide === 'current' ? 'Current selected' : 'Incoming selected'}
                    </span>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={selectedSide === 'current'}
                    disabled={disabled}
                    onClick={() => onDecision(region.id, { mode: 'block', side: 'current' })}
                    className={`min-w-0 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      selectedSide === 'current'
                        ? 'border-blue-400 bg-blue-500/10'
                        : 'border-blue-500/30 hover:bg-blue-500/5'
                    }`}
                  >
                    <span className="text-sm font-medium text-theme-primary">Use Current</span>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-theme-secondary">
                      {region.current.join(data.newline || '\n') || '(No content)'}
                    </pre>
                  </button>

                  <button
                    type="button"
                    aria-pressed={selectedSide === 'incoming'}
                    disabled={disabled}
                    onClick={() => onDecision(region.id, { mode: 'block', side: 'incoming' })}
                    className={`min-w-0 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      selectedSide === 'incoming'
                        ? 'border-amber-400 bg-amber-500/10'
                        : 'border-amber-500/30 hover:bg-amber-500/5'
                    }`}
                  >
                    <span className="text-sm font-medium text-theme-primary">Use Incoming</span>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-theme-secondary">
                      {region.incoming.join(data.newline || '\n') || '(No content)'}
                    </pre>
                  </button>
                </div>
              </section>
            );
          })}

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
    </div>
  );
}

export default TextConflictResolver;