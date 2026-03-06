/**
 * SwitchProjectModal - Confirmation modal for switching to a different project.
 * Triggered from the Building icon in the TopBar.
 * When confirmed, closes the current repo and returns to the welcome screen.
 */
import { memo, useCallback, useEffect, type KeyboardEvent, type CSSProperties } from 'react';
import { Building, FolderOpen } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { Button } from '../../components/ui';

// ============================================================================
// Types
// ============================================================================

interface SwitchProjectModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

function SwitchProjectModal({ open, onClose, onConfirm }: SwitchProjectModalProps): JSX.Element | null {

  const handleConfirm = useCallback(async (): Promise<void> => {
    await onConfirm();
    onClose();
  }, [onConfirm, onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleConfirm, onClose]);

  // Focus trap — auto-focus on open
  useEffect(() => {
    if (open) {
      const handleGlobalKey = (e: globalThis.KeyboardEvent): void => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleGlobalKey);
      return () => window.removeEventListener('keydown', handleGlobalKey);
    }
  }, [open, onClose]);

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
        <div className="w-full max-w-sm bg-theme-surface border border-theme-default rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-theme-default flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20">
              <Building
                style={iconStyle}
                className="text-blue-400"
              />
            </div>
            <h2 className="text-lg font-semibold text-theme-primary">
              Switch Project?
            </h2>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-3">
            <p className="text-sm text-theme-secondary">
              This will close the current project and take you back to the welcome screen where you can open a different project.
            </p>
            <div className="flex items-center gap-2 p-3 rounded bg-blue-500/10 border border-blue-500/20">
              <FolderOpen style={iconStyle} className="text-blue-400 shrink-0" />
              <p className="text-sm text-blue-300">
                Unsaved changes will remain — nothing is lost.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-theme-default flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleConfirm}
            >
              Open Another Project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(SwitchProjectModal);
