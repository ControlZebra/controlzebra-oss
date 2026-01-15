import * as React from "react";
import { cn } from "../../lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  variant?: "default" | "success" | "error";
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, variant = "default", ...props }, ref) => {
    const barColorClass: Record<string, string> = {
      default: "bg-blue-500",
      success: "bg-green-500",
      error: "bg-red-500",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700",
          className
        )}
        {...props}
      >
        <div
          className={cn("h-full transition-all duration-300 ease-in-out", barColorClass[variant] || "bg-blue-500")}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
