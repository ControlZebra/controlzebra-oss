/**
 * ExplorerPage - Main area content for Explorer view.
 * Shows file content viewer or empty state.
 */
import { memo } from 'react';
import { Folder } from 'lucide-react';
import { useRepo } from '../../../context';

function ExplorerPage() {
  const { repoPath } = useRepo();
  
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-neutral-600 px-4">
        <Folder style={{ width: 48, height: 48 }} className="mx-auto mb-4 text-neutral-700" />
        {repoPath ? (
          <>
            <p className="text-base text-neutral-400">File Explorer</p>
            <p className="text-sm mt-1">Double-click a file in the sidebar to view its contents</p>
          </>
        ) : (
          <>
            <p className="text-base text-neutral-400">No folder open</p>
            <p className="text-sm mt-1">Open a folder to browse files</p>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(ExplorerPage);
