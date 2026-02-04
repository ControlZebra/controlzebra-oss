/**
 * BranchModal - Modal for switching or creating branches.
 * Triggered from the TopBar branch indicator.
 */
import { memo, useState, useCallback, useEffect, type KeyboardEvent, type CSSProperties } from 'react';
import { GitBranch, Plus, Check, Search } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useRepo, type BranchInfo } from '../../context';
import { Button, Input } from '../ui';
import { cn } from '../../lib/utils';

// ============================================================================
// Types
// ============================================================================

interface BranchModalProps {
  open: boolean;
  onClose: () => void;
}

interface BranchItemProps {
  branch: BranchInfo;
  isCurrent: boolean;
  onSelect: (name: string) => void;
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
const BranchItem = memo(function BranchItem({ branch, isCurrent, onSelect }: BranchItemProps): JSX.Element {
  return (
    <button
      onClick={() => onSelect(branch.name)}
      disabled={isCurrent}
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

function BranchModal({ open, onClose }: BranchModalProps): JSX.Element | null {
  const { branches, repoInfo, switchBranch, createBranch, refreshBranches } = useRepo();
  const [mode, setMode] = useState<'switch' | 'create'>('switch');
  const [newBranchName, setNewBranchName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onClose();
    }
  }, [repoInfo, switchBranch, onClose]);

  // Handle create new branch
  const handleCreate = useCallback(async (): Promise<void> => {
    if (!newBranchName.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    const success = await createBranch(newBranchName.trim());
    
    setIsLoading(false);
    if (success) {
      onClose();
    }
  }, [newBranchName, createBranch, onClose]);

  // Handle key press
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && mode === 'create' && newBranchName.trim()) {
      handleCreate();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [mode, newBranchName, handleCreate, onClose]);

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
        <div className="w-full max-w-md bg-theme-surface border border-theme-default rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-theme-default flex items-center gap-2">
            <GitBranch style={iconStyle} className="text-theme-secondary" />
            <h2 className="text-theme-primary font-medium flex-1">
              {mode === 'switch' ? 'Switch Branch' : 'Create New Branch'}
            </h2>
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

          {/* Content */}
          <div className="p-4">
            {mode === 'create' ? (
              /* Create mode */
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-theme-secondary mb-1">
                    Branch name
                  </label>
                  <Input
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="feature/my-new-branch"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-theme-muted">
                  Branch will be created from current branch: <span className="text-theme-secondary">{repoInfo?.branch}</span>
                </p>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={!newBranchName.trim()}
                  loading={isLoading}
                >
                  Create Branch
                </Button>
              </div>
            ) : (
              /* Switch mode */
              <div className="space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" 
                    style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }}
                  />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search branches..."
                    className="pl-9"
                    autoFocus
                  />
                </div>

                {/* Branch list */}
                <div className="max-h-64 overflow-y-auto -mx-4 border-t border-b border-theme-default">
                  {filteredBranches.length === 0 ? (
                    <p className="px-4 py-3 text-theme-muted text-sm text-center">
                      {searchQuery ? 'No matching branches' : 'No branches found'}
                    </p>
                  ) : (
                    filteredBranches.map(branch => (
                      <BranchItem
                        key={branch.name}
                        branch={branch}
                        isCurrent={branch.name === repoInfo?.branch}
                        onSelect={handleSwitch}
                      />
                    ))
                  )}
                </div>

                {/* Remote branches hint */}
                {branches?.remote && branches.remote.length > 0 && (
                  <p className="text-xs text-theme-muted text-center">
                    {branches.remote.length} remote branch{branches.remote.length !== 1 ? 'es' : ''} available
                  </p>
                )}
              </div>
            )}

            {/* Error display */}
            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-theme-default flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(BranchModal);
