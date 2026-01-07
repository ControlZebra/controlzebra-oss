import * as React from "react";
import { cn } from "../../lib/utils";

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "flex items-center gap-2 text-xs text-theme-secondary mb-1",
      className
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
