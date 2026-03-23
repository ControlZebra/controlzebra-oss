/**
 * SwitchProjectModal - Confirmation modal for switching to a different project.
 * Triggered from the Building icon in the TopBar.
 * When confirmed, closes the current repo and returns to the welcome screen.
 */
import { memo, useCallback, useRef, type KeyboardEvent, type CSSProperties } from 'react';
import { Building, FolderOpen } from 'lucide-react';
import { ICON_SIZES } from '../../shared/constants';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../shared/ui';

// ============================================================================
// Types
// ============================================================================

interface SwitchProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

function SwitchProjectModal({ open, onOpenChange, onConfirm }: SwitchProjectModalProps): JSX.Element {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = useCallback(async (): Promise<void> => {
    await onConfirm();
    onOpenChange(false);
  }, [onConfirm, onOpenChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter') {
      void handleConfirm();
    }
  }, [handleConfirm]);

  const iconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      initialFocusRef={cancelButtonRef}
    >
      <DialogContent size="sm" className="overflow-hidden" onKeyDown={handleKeyDown}>
        <DialogHeader className="border-b border-theme-default">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20">
              <Building
                style={iconStyle}
                className="text-blue-400"
              />
            </div>
            <DialogTitle>
              Switch Project?
            </DialogTitle>
          </div>
          <DialogDescription>
            This will close the current project and take you back to the welcome screen where you can open a different project.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-2 p-3 rounded bg-blue-500/10 border border-blue-500/20">
            <FolderOpen style={iconStyle} className="text-blue-400 shrink-0" />
            <p className="text-sm text-blue-300">
              Unsaved changes will remain — nothing is lost.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-theme-default px-6 py-4">
          <Button
            ref={cancelButtonRef}
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={() => void handleConfirm()}
          >
            Open Another Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default memo(SwitchProjectModal);
