/**
 * NoDirectoryScreen - Welcome screen when no directory is opened.
 * Prompts user to open a folder to start tracking changes.
 */
import { memo } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { Button } from '../../../ui';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function NoDirectoryScreen({ onOpenFolder, isLoading }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter">
      <div className="max-w-md text-center">
        <h1 className="text-5xl font-light text-neutral-100 mb-2">Welcome!</h1>
        <p className="text-neutral-400 mb-8">Get started by opening a folder</p>
        
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-700/50 mb-6">
          <Folder style={{ width: 32, height: 32 }} className="text-neutral-500" />
        </div>
        
        <p className="text-neutral-500 text-sm mb-6">
          Open a folder containing your project files to start tracking changes.
        </p>
        
        <Button size="lg" onClick={onOpenFolder} loading={isLoading}>
          <FolderOpen style={iconStyle} />
          Open Folder
        </Button>
        
        <p className="text-xs text-neutral-600 mt-4">
          Tip: Use <kbd className="px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300">⌘O</kbd> to quickly open a folder
        </p>
      </div>
    </div>
  );
}

export default memo(NoDirectoryScreen);
