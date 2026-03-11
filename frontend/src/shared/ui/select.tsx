/**
 * Select - A custom select component using Popover for dropdown functionality.
 * Follows shadcn patterns with theme support.
 */
import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../utils/misc";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// ============================================================================
// Types
// ============================================================================

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// ============================================================================
// Select Component
// ============================================================================

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ value, onValueChange, options, placeholder = "Select...", disabled, className }, ref) => {
    const [open, setOpen] = React.useState(false);

    const selectedOption = options.find((opt) => opt.value === value);

    const handleSelect = (optionValue: string) => {
      onValueChange?.(optionValue);
      setOpen(false);
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded border border-theme-default bg-theme-surface px-3 py-2 text-sm transition-colors",
              "hover:border-theme-hover",
              "focus:outline-none focus:border-blue-500",
              "disabled:cursor-not-allowed disabled:opacity-50",
              !selectedOption && "text-theme-muted",
              selectedOption && "text-theme-primary",
              className
            )}
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-theme-muted transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-1"
          align="start"
        >
          <div className="max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                  "hover:bg-theme-muted focus:bg-theme-muted",
                  option.value === value
                    ? "bg-theme-muted text-theme-primary"
                    : "text-theme-secondary"
                )}
              >
                <span className="flex-1 truncate text-left">{option.label}</span>
                {option.value === value && (
                  <Check className="h-4 w-4 shrink-0 text-blue-500" />
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);
Select.displayName = "Select";

// ============================================================================
// ToggleGroup - For visibility toggle (Private/Public)
// ============================================================================

export interface ToggleGroupOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ToggleGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: ToggleGroupOption[];
  disabled?: boolean;
  className?: string;
}

const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ value, onValueChange, options, disabled, className }, ref) => {
    return (
      <div
        ref={ref}
        role="radiogroup"
        className={cn(
          "inline-flex h-9 items-center justify-center rounded border border-theme-default bg-theme-surface p-0.5",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={disabled}
            onClick={() => onValueChange?.(option.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1 text-xs font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-theme-surface",
              "disabled:pointer-events-none disabled:opacity-50",
              value === option.value
                ? "bg-theme-primary text-theme-primary-foreground shadow-sm"
                : "text-theme-muted hover:text-theme-primary hover:bg-theme-muted/50"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    );
  }
);
ToggleGroup.displayName = "ToggleGroup";

export { Select, ToggleGroup };
