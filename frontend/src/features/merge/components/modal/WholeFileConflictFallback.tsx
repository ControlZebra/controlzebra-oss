import { AlertTriangle } from 'lucide-react';

import { Button } from '../../../../shared/ui';
import type { ResolutionStrategy } from '../../../../domain/repo/context/RepoContext.types';

interface WholeFileConflictFallbackProps {
  path: string;
  disabled: boolean;
  reason?: string;
  onResolve: (strategy: ResolutionStrategy) => void | Promise<void>;
}

function WholeFileConflictFallback({
  path,
  disabled,
  reason,
  onResolve,
}: WholeFileConflictFallbackProps): JSX.Element {
  return (
    <div className="rounded-lg border border-theme-default bg-theme-surface p-6">
      <div className="mb-5 flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div>
          <h3 className="text-base font-medium text-theme-primary">Choose the complete file to keep</h3>
          <p className="mt-1 break-all text-sm text-theme-secondary">{path}</p>
          <p className="mt-2 text-sm text-theme-secondary">
            {reason || 'This file cannot be safely reviewed in smaller sections.'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => void onResolve('mine')}
          className="h-auto justify-start border-blue-500/30 px-4 py-4 text-left"
        >
          <span>
            <span className="block text-sm font-medium">Keep Current File</span>
            <span className="mt-1 block text-xs font-normal text-theme-secondary">
              Replace the complete file with the Current version.
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => void onResolve('theirs')}
          className="h-auto justify-start border-amber-500/30 px-4 py-4 text-left"
        >
          <span>
            <span className="block text-sm font-medium">Keep Incoming File</span>
            <span className="mt-1 block text-xs font-normal text-theme-secondary">
              Replace the complete file with the Incoming version.
            </span>
          </span>
        </Button>
      </div>
    </div>
  );
}

export default WholeFileConflictFallback;