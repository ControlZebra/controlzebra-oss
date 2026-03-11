import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../utils/misc"

/**
 * ButtonGroup - A container that groups related buttons together.
 * Based on shadcn/ui button-group component.
 * 
 * Use nested ButtonGroup components to create complex layouts with spacing.
 * Use ButtonGroupSeparator to visually divide buttons within a group.
 */

const buttonGroupVariants = cva(
  "inline-flex items-center justify-center",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical: "flex-col",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
)

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof buttonGroupVariants> {}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="group"
        className={cn(
          buttonGroupVariants({ orientation }),
          // Join borders for adjacent buttons in horizontal layout
          orientation === "horizontal" && [
            "[&>button:not(:first-child):not(:last-child)]:rounded-none",
            "[&>button:first-child:not(:only-child)]:rounded-r-none",
            "[&>button:last-child:not(:only-child)]:rounded-l-none",
            "[&>button:not(:first-child)]:border-l-0",
          ],
          // Join borders for adjacent buttons in vertical layout
          orientation === "vertical" && [
            "[&>button:not(:first-child):not(:last-child)]:rounded-none",
            "[&>button:first-child:not(:only-child)]:rounded-b-none",
            "[&>button:last-child:not(:only-child)]:rounded-t-none",
            "[&>button:not(:first-child)]:border-t-0",
          ],
          className
        )}
        {...props}
      />
    )
  }
)
ButtonGroup.displayName = "ButtonGroup"

export interface ButtonGroupSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal";
}

const ButtonGroupSeparator = React.forwardRef<HTMLDivElement, ButtonGroupSeparatorProps>(
  ({ className, orientation = "vertical", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-theme-muted shrink-0",
          orientation === "vertical" ? "h-full w-px" : "h-px w-full",
          className
        )}
        {...props}
      />
    )
  }
)
ButtonGroupSeparator.displayName = "ButtonGroupSeparator"

export interface ButtonGroupTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  asChild?: boolean;
}

const ButtonGroupText = React.forwardRef<HTMLSpanElement, ButtonGroupTextProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? React.Fragment : "span"
    return (
      <Comp
        ref={asChild ? undefined : ref}
        className={cn(
          "px-3 text-sm font-medium text-theme-primary",
          className
        )}
        {...props}
      />
    )
  }
)
ButtonGroupText.displayName = "ButtonGroupText"

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants }
