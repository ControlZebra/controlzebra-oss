/**
 * UndoLastSaveDialog - Confirmation dialog for undoing the most recent save.
 */
import { memo } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './alert-dialog';

interface UndoLastSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

function UndoLastSaveDialog({ open, onOpenChange, onConfirm }: UndoLastSaveDialogProps): JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo last save?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove your most recent save and put those changes back into your files so you can edit them again.
            Nothing will be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="default" onClick={onConfirm}>
            Undo last save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(UndoLastSaveDialog);
