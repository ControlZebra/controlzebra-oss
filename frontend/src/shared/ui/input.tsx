import * as React from "react";
import { cn } from "../utils/misc";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border-0 bg-theme-muted px-3 py-2 text-sm text-theme-primary placeholder:text-theme-muted transition-colors",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
