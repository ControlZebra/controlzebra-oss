/**
 * NewProjectPage - Initialize a new repository.
 * 
 * Stub placeholder — full implementation coming in Phase 5.
 * Provides local path selection, remote config (GitHub), and project creation.
 */
import { memo, type CSSProperties } from 'react';
import { FolderPlus } from 'lucide-react';
import { ICON_STYLES } from '../../../../lib/gitHelpers';

function NewProjectPage(): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter">
      <div className="max-w-2xl w-full text-center">
        <FolderPlus 
          style={{ width: 64, height: 64 } as CSSProperties} 
          className="text-theme-muted mx-auto mb-6" 
          strokeWidth={1} 
        />
        <h1 className="text-xl font-semibold text-theme-primary mb-2">
          New Project
        </h1>
        <p className="text-theme-muted text-sm">
          Initialize a new repository with version control. Coming soon.
        </p>
      </div>
    </div>
  );
}

export default memo(NewProjectPage);
