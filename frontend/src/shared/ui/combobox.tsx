import { memo, useCallback, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { ICON_STYLES } from '../utils/gitHelpers';
import { cn } from '../utils/misc';

interface ComboboxProps {
  value: string;
  options: { value: string; label: string }[];
  label: string;
  placeholder: string;
  disabled?: boolean;
  icon?: ReactNode;
  onSelect: (value: string) => Promise<boolean>;
  onOpen?: () => void;
  action?: { label: string; onSelect: () => void };
  className?: string;
}

// shadcn's Radix Popover + Command composition delegates search, active-option
// announcements and keyboard selection to cmdk.
function Combobox({
  value,
  options,
  label,
  placeholder,
  disabled,
  icon,
  onSelect,
  onOpen,
  action,
  className,
}: ComboboxProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handleOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setError('');
        onOpen?.();
      }
    },
    [onOpen]
  );
  const select = useCallback(
    async (next: string) => {
      if (busy || disabled || next === value) return;
      setBusy(true);
      try {
        if (await onSelect(next)) setOpen(false);
      } catch {
        setError('The selection could not be changed. Try again.');
      } finally {
        setBusy(false);
      }
    },
    [busy, disabled, onSelect, value]
  );
  return (
    <Popover open={open && !disabled} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-label={label}
          aria-expanded={open && !disabled}
          aria-haspopup="listbox"
          disabled={disabled || busy}
          title={value}
          className={cn('min-w-0 justify-start', className)}
        >
          {icon}
          <span className="truncate">{value || 'No branch'}</span>
          <ChevronsUpDown style={ICON_STYLES.xs} className="ml-auto shrink-0 text-theme-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-1">
        <Command label={placeholder}>
          <div className="flex items-center gap-2 px-2">
            <Search style={ICON_STYLES.sm} className="text-theme-muted" />
            <Command.Input
              aria-label={placeholder}
              placeholder={placeholder}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-theme-muted"
            />
          </div>
          <Command.List className="max-h-60 overflow-y-auto" aria-busy={busy}>
            <Command.Empty className="p-3 text-sm text-theme-muted">
              No branches found.
            </Command.Empty>
            <Command.Group>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.value}
                  disabled={busy || disabled}
                  onSelect={() => void select(option.value)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-theme-primary data-[selected=true]:bg-theme-hover data-[disabled=true]:opacity-50"
                >
                  <Check
                    style={ICON_STYLES.sm}
                    className={option.value === value ? 'shrink-0' : 'shrink-0 opacity-0'}
                  />
                  <span className="truncate" title={option.label}>
                    {option.label}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
            {action ? (
              <Command.Item
                forceMount
                value="create-branch-action"
                disabled={busy || disabled}
                onSelect={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className="mt-1 cursor-pointer rounded-md bg-theme-subtle px-3 py-2 text-sm text-theme-secondary data-[selected=true]:bg-theme-hover"
              >
                {action.label}
              </Command.Item>
            ) : null}
          </Command.List>
          {error ? (
            <p role="alert" className="px-2 py-2 text-sm text-theme-error">
              {error}
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default memo(Combobox);
