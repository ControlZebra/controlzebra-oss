/**
 * RewindConfirmModal - Confirmation modal for the "Rewind" (git reset --hard HEAD) action.
 * Requires user to type "Rewind" as a safety mechanism before allowing confirmation.
 */
import { memo, useState, useCallback, useEffect, useRef, type KeyboardEvent, type ChangeEvent, type CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ICON_SIZES } from '../../shared/constants';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Input,
} from '../../shared/ui';

// ============================================================================
// Types
// ============================================================================

interface RewindConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
  title?: string;
  description?: string;
  warningText?: string;
  confirmButtonText?: string;
  confirmationWord?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIRMATION_WORD = 'Delete';

// ============================================================================
// Component
// ============================================================================

function RewindConfirmModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  title = 'Delete Uncommitted Changes?',
  description = 'This will permanently delete all uncommitted changes and restore files to the last saved snapshot.',
  warningText = '⚠️ This cannot be undone. Any work not saved in a commit will be lost.',
  confirmButtonText = 'Delete Changes',
  confirmationWord = DEFAULT_CONFIRMATION_WORD,
}: RewindConfirmModalProps): JSX.Element | null {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Reset input when modal opens/closes
  useEffect(() => {
    if (open) {
      setInputValue('');
    }
  }, [open]);

  const isConfirmEnabled = inputValue === confirmationWord;

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>): void => {
    setInputValue(e.target.value);
  }, []);

  const handleConfirm = useCallback(async (): Promise<void> => {
    if (!isConfirmEnabled) return;
    await onConfirm();
  }, [isConfirmEnabled, onConfirm]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && isConfirmEnabled && !isLoading) {
      void handleConfirm();
    }
  }, [isConfirmEnabled, isLoading, handleConfirm]);

  const handleConfirmAction = useCallback((event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    void handleConfirm();
  }, [handleConfirm]);

  const iconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };

  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
      initialFocusRef={inputRef}
    >
      <AlertDialogContent className="overflow-hidden" onKeyDown={handleKeyDown}>
        <AlertDialogHeader className="border-b border-theme-default">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20">
              <AlertTriangle 
                style={iconStyle} 
                className="text-red-500" 
              />
            </div>
            <AlertDialogTitle>
              {title}
            </AlertDialogTitle>
          </div>
        </AlertDialogHeader>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-theme-secondary">
            {description}
          </p>

          <div className="p-3 rounded bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400 font-medium">
              {warningText}
            </p>
          </div>

          <div>
            <label className="block text-xs text-theme-secondary mb-2">
              Type <span className="font-bold text-theme-primary">{confirmationWord}</span> to confirm
            </label>
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              placeholder={confirmationWord}
              disabled={isLoading}
            />
          </div>
        </div>

        <AlertDialogFooter className="border-t border-theme-default px-6 py-4">
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirmAction}
            disabled={!isConfirmEnabled}
            loading={isLoading}
          >
            {confirmButtonText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(RewindConfirmModal);
