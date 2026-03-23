import { memo, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { VIEWS } from '../../shared/constants';
import { useLayout, useRepo } from '../../context';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../../shared/ui';

function NonGitFolderPromptModal(): JSX.Element {
  const {
    repoPath,
    nonGitFolderPromptPath,
    dismissNonGitFolderPrompt,
    closeRepo,
  } = useRepo();
  const {
    setActiveView,
    setSelectedWelcomeCategory,
    setNewProjectPrefillPath,
  } = useLayout();

  const isOpen = !!nonGitFolderPromptPath;

  const handleOpenChange = useCallback((open: boolean): void => {
    if (open) {
      return;
    }

    dismissNonGitFolderPrompt();
  }, [dismissNonGitFolderPrompt]);

  const handleInitiateVersionControl = useCallback(async () => {
    if (!nonGitFolderPromptPath) return;

    const selectedPath = nonGitFolderPromptPath;
    dismissNonGitFolderPrompt();

    if (repoPath) {
      await closeRepo();
    }

    setActiveView(VIEWS.EXPLORER);
    setSelectedWelcomeCategory('new-project');
    setNewProjectPrefillPath(selectedPath);
  }, [
    nonGitFolderPromptPath,
    dismissNonGitFolderPrompt,
    repoPath,
    closeRepo,
    setActiveView,
    setSelectedWelcomeCategory,
    setNewProjectPrefillPath,
  ]);

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-yellow-400" />
            <AlertDialogTitle>Git version control is not enabled</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            This folder is not initialized as a Git repository.
            {nonGitFolderPromptPath ? `\n\n${nonGitFolderPromptPath}` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="default" onClick={() => void handleInitiateVersionControl()}>
            Enable Version Control
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(NonGitFolderPromptModal);
