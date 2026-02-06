/**
 * RewindConfirmModal - Confirmation modal for the "Rewind" (git reset --hard HEAD) action.
 * Requires user to type "Rewind" as a safety mechanism before allowing confirmation.
 */
import { memo, useState, useCallback, useEffect, type KeyboardEvent, type ChangeEvent, type CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { Button, Input } from '../ui';

// ============================================================================
// Types
// ============================================================================

interface RewindConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CONFIRMATION_WORD = 'Delete';

// ============================================================================
// Component
// ============================================================================

function RewindConfirmModal({ open, onClose, onConfirm, isLoading = false }: RewindConfirmModalProps): JSX.Element | null {
  const [inputValue, setInputValue] = useState('');
  
  // Reset input when modal opens/closes
  useEffect(() => {
    if (open) {
      setInputValue('');
    }
  }, [open]);

  const isConfirmEnabled = inputValue === CONFIRMATION_WORD;

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>): void => {
    setInputValue(e.target.value);
  }, []);

  const handleConfirm = useCallback(async (): Promise<void> => {
    if (!isConfirmEnabled) return;
    await onConfirm();
  }, [isConfirmEnabled, onConfirm]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && isConfirmEnabled && !isLoading) {
      handleConfirm();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [isConfirmEnabled, isLoading, handleConfirm, onClose]);

  if (!open) return null;

  const iconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };

  return (
    <div className="fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-theme-surface border border-theme-default rounded-lg shadow-xl overflow-hidden">
          {/* Header with warning icon */}
          <div className="px-6 py-4 border-b border-theme-default flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20">
              <AlertTriangle 
                style={iconStyle} 
                className="text-red-500" 
              />
            </div>
            <h2 className="text-lg font-semibold text-theme-primary">
              Delete Uncommitted Changes?
            </h2>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            <p className="text-sm text-theme-secondary">
              This will permanently delete all uncommitted changes and restore files to the last saved snapshot.
            </p>
            
            <div className="p-3 rounded bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400 font-medium">
                ⚠️ This cannot be undone. Any work not saved in a commit will be lost.
              </p>
            </div>

            {/* Confirmation input */}
            <div>
              <label className="block text-xs text-theme-secondary mb-2">
                Type <span className="font-bold text-theme-primary">{CONFIRMATION_WORD}</span> to confirm
              </label>
              <Input
                value={inputValue}
                onChange={handleInputChange}
                placeholder={CONFIRMATION_WORD}
                autoFocus
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-theme-default flex justify-end gap-2">
            <Button 
              variant="secondary" 
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleConfirm}
              disabled={!isConfirmEnabled}
              loading={isLoading}
            >
              Delete Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(RewindConfirmModal);
