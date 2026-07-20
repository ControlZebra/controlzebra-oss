/**
 * DebugView - Sidebar helper content for non-technical users.
 *
 * The full debug console is intentionally shown in MainArea (DebugPage).
 */
import { memo } from 'react';

function DebugView(): JSX.Element {
  return (
    <div className="h-full overflow-y-auto p-3 select-text">
      <div className="rounded-lg border border-theme-default bg-theme-surface p-3">
        <h3 className="text-sm font-medium text-theme-primary">How to use Debug Logs</h3>
        <p className="text-xs text-theme-muted mt-1">
          Use this only when support asks for diagnostics.
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-theme-default bg-theme-surface p-3 text-xs text-theme-secondary">
        <div>
          <p className="font-medium text-theme-primary mb-1">1) Start capture</p>
          <p>In the main panel, turn on <span className="text-theme-primary">Debug logging</span>.</p>
        </div>

        <div className="mt-3">
          <p className="font-medium text-theme-primary mb-1">2) Reproduce the issue</p>
          <p>Do the action that failed (sync, commit, open file, etc.).</p>
        </div>

        <div className="mt-3">
          <p className="font-medium text-theme-primary mb-1">3) Export and send</p>
          <p>Click <span className="text-theme-primary">Export</span> in the main panel and share the file with support.</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-theme-warning bg-theme-warning p-2.5 text-xs text-theme-warning">
        Debug logs can include repository paths and error details. Share only with trusted support.
      </div>
    </div>
  );
}

export default memo(DebugView);
