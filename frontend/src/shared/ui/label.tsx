import * as React from "react";
import { cn } from "../utils/misc";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "flex items-center gap-2 text-xs text-theme-secondary mb-1",
        className
      )}
      {...props}
    />
  )
);
Label.displayName = "Label";

export { Label };
