import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Check, ChevronDown, GitBranch } from 'lucide-react';

import { ICON_SIZES } from '../../../../shared/constants';
import { Button } from '../../../../shared/ui';

const iconSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

export interface TargetBranchOption {
  name: string;
  isCurrent: boolean;
}

interface TargetBranchDrawerProps {
  disabled?: boolean;
  onSelect: (branchName: string) => void;
  options: TargetBranchOption[];
  selectedBranch: string;
  variant: 'header' | 'panel';
}

function TargetBranchDrawer({
  disabled = false,
  onSelect,
  options,
  selectedBranch,
  variant,
}: TargetBranchDrawerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const drawerId = useId();
  const selectedLabel = selectedBranch || 'choose branch';

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  const drawerClassName = variant === 'header'
    ? 'absolute left-0 top-full z-20 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-theme-default bg-theme-surface shadow-xl'
    : 'absolute left-0 top-full z-20 mt-2 w-full min-w-[18rem] overflow-hidden rounded-xl border border-theme-default bg-theme-surface text-left shadow-xl';

  const trigger = variant === 'header' ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-controls={drawerId}
      aria-label={`Change target branch from ${selectedLabel}`}
      className="h-9 rounded-xl border-theme-default bg-theme-surface/70 px-3 text-theme-primary"
    >
      <GitBranch style={iconSm} className="shrink-0 text-amber-400" />
      <span className="truncate">{selectedLabel}</span>
      <ChevronDown
        style={iconSm}
        className={`shrink-0 text-theme-muted transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-controls={drawerId}
      className="h-11 w-full justify-between rounded-lg border-theme-default px-3 text-theme-primary"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <GitBranch style={iconSm} className="shrink-0 text-amber-400" />
        <span className="truncate">{selectedLabel}</span>
      </span>
      <ChevronDown
        style={iconSm}
        className={`shrink-0 text-theme-muted transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </Button>
  );

  return (
    <div ref={rootRef} className="relative">
      {variant === 'header' ? (
        trigger
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-theme-primary">Destination branch</p>
          {trigger}
        </div>
      )}

      {open && (
        <div id={drawerId} className={drawerClassName}>
          <div className="border-b border-theme-default px-4 py-3">
            <p className="text-sm font-medium text-theme-primary">Choose a destination branch</p>
            <p className="mt-1 text-xs text-theme-secondary">Pick another branch before you continue the merge.</p>
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {options.map((branch) => {
              const isSelected = branch.name === selectedBranch;

              return (
                <button
                  key={branch.name}
                  type="button"
                  disabled={branch.isCurrent}
                  onClick={() => {
                    onSelect(branch.name);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    branch.isCurrent
                      ? 'cursor-not-allowed bg-theme-muted/30 text-theme-muted opacity-100'
                      : isSelected
                        ? 'bg-theme-muted text-theme-primary'
                        : 'text-theme-secondary hover:bg-theme-muted/60 hover:text-theme-primary'
                  }`}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{branch.name}</span>
                    {branch.isCurrent && <span className="ml-2 text-xs text-theme-muted">(Current branch)</span>}
                  </span>
                  {isSelected && <Check style={iconSm} className="shrink-0 text-blue-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(TargetBranchDrawer);