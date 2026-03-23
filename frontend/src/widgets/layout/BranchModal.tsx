/**
 * BranchModal - Modal for switching or creating branches.
 * Triggered from the TopBar branch indicator.
 */
import { memo, useState, useCallback, useEffect, useRef, type KeyboardEvent, type CSSProperties } from 'react';
import { GitBranch, Plus, Check, Search } from 'lucide-react';
import { ICON_SIZES } from '../../shared/constants';
import { useRepo, type BranchInfo } from '../../context';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input } from '../../shared/ui';
import { cn } from '../../shared/utils/misc';

// ============================================================================
// Types
// ============================================================================

interface BranchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BranchItemProps {
  branch: BranchInfo;
  isCurrent: boolean;
  onSelect: (name: string) => void;
  disabled?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

// ============================================================================
// Components
// ============================================================================

/**
 * BranchItem - Single branch in the list.
 */
const BranchItem = memo(function BranchItem({ branch, isCurrent, onSelect, disabled = false }: BranchItemProps): JSX.Element {
  return (
    <button
      onClick={() => onSelect(branch.name)}
      disabled={isCurrent || disabled}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
        isCurrent 
          ? "bg-blue-600/20 text-blue-300 cursor-default" 
          : "hover-bg-theme-interactive text-theme-primary"
      )}
    >
      <GitBranch style={iconStyle} className={isCurrent ? "text-blue-400" : "text-theme-secondary"} />
      <span className="flex-1 text-sm truncate">{branch.name}</span>
      {isCurrent && <Check style={iconStyle} className="text-blue-400" />}
      {branch.upstream && (
        <span className="text-xs text-theme-muted">{branch.upstream}</span>
      )}
    </button>
  );
});

function BranchModal({ open, onOpenChange }: BranchModalProps): JSX.Element {
  const { branches, repoInfo, switchBranch, createBranch, refreshBranches, operationInProgress } = useRepo();
  const [mode, setMode] = useState<'switch' | 'create'>('switch');
  const [newBranchName, setNewBranchName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newBranchInputRef = useRef<HTMLInputElement>(null);

  // Refresh branches when modal opens
  useEffect(() => {
    if (open) {
      refreshBranches();
      setMode('switch');
      setNewBranchName('');
      setSearchQuery('');
      setError(null);
    }
  }, [open, refreshBranches]);

  // Filter branches by search query
  const filteredBranches = (branches?.local || []).filter(branch =>
    branch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle branch switch
  const handleSwitch = useCallback(async (branchName: string): Promise<void> => {
    if (branchName === repoInfo?.branch) return;
    
    setIsLoading(true);
    setError(null);
    
    const success = await switchBranch(branchName);
    
    setIsLoading(false);
    if (success) {
      onOpenChange(false);
    }
  }, [repoInfo, switchBranch, onOpenChange]);

  // Handle create new branch
  const handleCreate = useCallback(async (): Promise<void> => {
    if (!newBranchName.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    const success = await createBranch(newBranchName.trim());
    
    setIsLoading(false);
    if (success) {
      onOpenChange(false);
    }
  }, [newBranchName, createBranch, onOpenChange]);

  // Handle key press
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && mode === 'create' && newBranchName.trim()) {
      void handleCreate();
    }
  }, [mode, newBranchName, handleCreate]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      initialFocusRef={mode === 'create' ? newBranchInputRef : searchInputRef}
    >
      <DialogContent
        size="md"
        containerClassName="items-start pt-20"
        className="overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="border-b border-theme-default px-4 py-3">
          <div className="flex items-center gap-2">
            <GitBranch style={iconStyle} className="text-theme-secondary" />
            <DialogTitle className="flex-1 text-base font-medium">
              {mode === 'switch' ? 'Switch Branch' : 'Create New Branch'}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode(mode === 'switch' ? 'create' : 'switch')}
            >
              {mode === 'switch' ? (
                <>
                  <Plus style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
                  <span>New</span>
                </>
              ) : (
                <span>Switch</span>
              )}
            </Button>
          </div>
        </DialogHeader>

        <div className="p-4">
          {mode === 'create' ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-theme-secondary">
                  Branch name
                </label>
                <Input
                  ref={newBranchInputRef}
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="feature/my-new-branch"
                />
              </div>
              <p className="text-xs text-theme-muted">
                Branch will be created from current branch: <span className="text-theme-secondary">{repoInfo?.branch}</span>
              </p>
              <Button
                className="w-full"
                onClick={() => void handleCreate()}
                disabled={!newBranchName.trim() || operationInProgress}
                loading={isLoading}
              >
                Create Branch
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"
                  style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }}
                />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search branches..."
                  className="pl-9"
                />
              </div>

              <div className="-mx-4 max-h-64 overflow-y-auto border-y border-theme-default">
                {filteredBranches.length === 0 ? (
                  <p className="px-4 py-3 text-center text-sm text-theme-muted">
                    {searchQuery ? 'No matching branches' : 'No branches found'}
                  </p>
                ) : (
                  filteredBranches.map(branch => (
                    <BranchItem
                      key={branch.name}
                      branch={branch}
                      isCurrent={branch.name === repoInfo?.branch}
                      onSelect={handleSwitch}
                      disabled={isLoading || operationInProgress}
                    />
                  ))
                )}
              </div>

              {branches?.remote && branches.remote.length > 0 && (
                <p className="text-center text-xs text-theme-muted">
                  {branches.remote.length} remote branch{branches.remote.length !== 1 ? 'es' : ''} available
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter className="border-t border-theme-default px-4 py-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default memo(BranchModal);
