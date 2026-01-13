/**
 * BranchNameModal - Modal for entering a branch name when using "Branch and Save".
 * Used when committing from a protected branch.
 */
import { memo, useState, useCallback, useEffect } from 'react';
import { GitBranch } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { Button, Input } from '../ui';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function BranchNameModal({ 
  open, 
  onClose, 
  onConfirm, 
  defaultBranchName = '',
  isLoading = false,
  currentBranch = 'main',
}) {
  const [branchName, setBranchName] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setBranchName(defaultBranchName);
    }
  }, [open, defaultBranchName]);

  const handleConfirm = useCallback(() => {
    if (!branchName.trim()) return;
    onConfirm(branchName.trim());
  }, [branchName, onConfirm]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && branchName.trim()) {
      handleConfirm();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [branchName, handleConfirm, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-start justify-center pt-20 px-4">
        <div className="w-full max-w-sm bg-theme-surface border border-theme-default rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-theme-default flex items-center gap-2">
            <GitBranch style={iconStyle} className="text-theme-secondary" />
            <h2 className="text-theme-primary font-medium flex-1">
              Create Branch & Save
            </h2>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-theme-secondary mb-1">
                Branch name
              </label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="feature/my-changes"
                autoFocus
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
