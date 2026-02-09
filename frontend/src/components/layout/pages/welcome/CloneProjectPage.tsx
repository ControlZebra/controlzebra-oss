/**
 * CloneProjectPage - Clone a repository from GitHub.
 * 
 * Stub placeholder — full implementation coming in Phase 7.
 * Provides GitHub auth, repo search/selection, and clone destination.
 */
import { memo, type CSSProperties } from 'react';
import { Download } from 'lucide-react';
import { ICON_STYLES } from '../../../../lib/gitHelpers';

function CloneProjectPage(): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter">
      <div className="max-w-2xl w-full text-center">
        <Download 
          style={{ width: 64, height: 64 } as CSSProperties} 
          className="text-theme-muted mx-auto mb-6" 
          strokeWidth={1} 
        />
        <h1 className="text-xl font-semibold text-theme-primary mb-2">
          Clone Project
        </h1>
        <p className="text-theme-muted text-sm">
          Clone an existing repository from GitHub. Coming soon.
        </p>
      </div>
    </div>
  );
}

export default memo(CloneProjectPage);
