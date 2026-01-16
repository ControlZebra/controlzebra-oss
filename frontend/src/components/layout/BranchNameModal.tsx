/**
 * BranchNameModal - Modal for entering a branch name when using "Branch and Save".
 * Used when committing from a protected branch.
 */
import { memo, useState, useCallback, useEffect, useRef, type KeyboardEvent, type CSSProperties } from 'react';
import { GitBranch } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { Button, Input } from '../ui';

// ============================================================================
// Types
// ============================================================================

interface BranchNameModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (branchName: string) => void;
  defaultBranchName?: string;
  isLoading?: boolean;
  currentBranch?: string;
}

// ============================================================================
// Styles
// ============================================================================

const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

// ============================================================================
// Component
// ============================================================================

function BranchNameModal({ 
  open, 
  onClose, 
  onConfirm, 
  defaultBranchName = '',
  isLoading = false,
  currentBranch = 'main',
}: BranchNameModalProps): JSX.Element | null {
  const [branchName, setBranchName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens and focus input
  useEffect(() => {
    if (open) {
      setBranchName(defaultBranchName);
      // Focus input after state update
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open, defaultBranchName]);

  const handleConfirm = useCallback((): void => {
    if (!branchName.trim()) return;
    onConfirm(branchName.trim());
  }, [branchName, onConfirm]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && branchName.trim()) {
      handleConfirm();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [branchName, handleConfirm, onClose]);

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-50" 
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="branch-modal-title"
    >
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-start justify-center pt-20 px-4">
        <div className="w-full max-w-sm bg-theme-surface border border-theme-default rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-theme-default flex items-center gap-2">
            <GitBranch style={iconStyle} className="text-theme-secondary" />
            <h2 id="branch-modal-title" className="text-theme-primary font-medium flex-1">
              Create Branch & Save
            </h2>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <div>
              <label htmlFor="branch-name-input" className="block text-xs text-theme-secondary mb-1">
                Branch name
              </label>
              <Input
                ref={inputRef}
                id="branch-name-input"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="feature/my-changes"
                disabled={isLoading}
              />
            </div>
            <p className="text-xs text-theme-muted">
              Creates branch from <span className="font-mono text-theme-secondary">{currentBranch}</span>, moves changes there, and saves.
            </p>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-theme-default flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={!branchName.trim()}
              loading={isLoading}
            >
              Create & Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(BranchNameModal);
