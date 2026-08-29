import { memo } from 'react';

import { useRepo } from '../../context';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../shared/ui';

function DefaultBranchSyncConfirmModal(): JSX.Element | null {
  const {
    defaultBranchSyncPrompt,
    confirmDefaultBranchSync,
    cancelDefaultBranchSync,
  } = useRepo();

  if (!defaultBranchSyncPrompt) {
    return null;
  }

  return (
    <AlertDialog
      open={defaultBranchSyncPrompt.isOpen}
      onOpenChange={(open) => {
        if (!open) cancelDefaultBranchSync();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Push changes on the default branch?</AlertDialogTitle>
          <AlertDialogDescription>
            {defaultBranchSyncPrompt.branch} is this repository&apos;s shared default branch.
            Sync will pull your team&apos;s latest work before pushing. If the same files changed,
            you&apos;ll review those decisions before anything is shared.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelDefaultBranchSync}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDefaultBranchSync}>Continue Sync</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(DefaultBranchSyncConfirmModal);
