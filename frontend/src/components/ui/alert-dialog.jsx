/**
 * AlertDialog - shadcn-style confirmation dialog.
 * A controlled modal for destructive actions that require user confirmation.
 */
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

// Context for managing dialog state
const AlertDialogContext = React.createContext(null);

/**
 * AlertDialog - Root component that manages open/close state.
 */
function AlertDialog({ open, onOpenChange, children }) {
  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

/**
 * AlertDialogTrigger - Button that opens the dialog.
 */
const AlertDialogTrigger = React.forwardRef(({ asChild, children, ...props }, ref) => {
  const { onOpenChange } = React.useContext(AlertDialogContext);
  
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      ref,
      onClick: (e) => {
        children.props.onClick?.(e);
        onOpenChange?.(true);
      },
    });
  }
  
  return (
    <button ref={ref} onClick={() => onOpenChange?.(true)} {...props}>
      {children}
    </button>
  );
});
AlertDialogTrigger.displayName = "AlertDialogTrigger";

/**
 * AlertDialogPortal - Renders dialog content in a portal.
 */
function AlertDialogPortal({ children }) {
  const { open } = React.useContext(AlertDialogContext);
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50">
      {children}
    </div>
  );
}

/**
 * AlertDialogOverlay - Dark backdrop behind the dialog.
 */
const AlertDialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0",
      className
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = "AlertDialogOverlay";

/**
 * AlertDialogContent - Main dialog container.
 */
const AlertDialogContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const { onOpenChange } = React.useContext(AlertDialogContext);
  
  // Close on Escape key
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onOpenChange?.(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onOpenChange]);
  
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          ref={ref}
          className={cn(
            "relative w-full max-w-md bg-theme-surface border border-theme-default rounded-lg shadow-xl",
            "animate-in fade-in-0 zoom-in-95 duration-200",
            className
          )}
          role="alertdialog"
          aria-modal="true"
          {...props}
        >
          {children}
        </div>
      </div>
    </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = "AlertDialogContent";

/**
 * AlertDialogHeader - Container for title and description.
 */
function AlertDialogHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-6 pb-4", className)}
      {...props}
    />
  );
}

/**
 * AlertDialogFooter - Container for action buttons.
 */
function AlertDialogFooter({ className, ...props }) {
  return (
    <div
      className={cn("flex justify-end gap-2 p-6 pt-2", className)}
      {...props}
    />
  );
}

/**
 * AlertDialogTitle - Dialog title.
 */
const AlertDialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold text-theme-primary", className)}
    {...props}
  />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

/**
 * AlertDialogDescription - Dialog description text.
 */
const AlertDialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-theme-secondary", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

/**
 * AlertDialogAction - Primary action button (destructive by default).
 */
const AlertDialogAction = React.forwardRef(({ className, variant = "destructive", onClick, ...props }, ref) => {
  const { onOpenChange } = React.useContext(AlertDialogContext);
  
  return (
    <Button
      ref={ref}
      variant={variant}
      onClick={async (e) => {
        await onClick?.(e);
        // Only close if onClick doesn't prevent default
        if (!e.defaultPrevented) {
          onOpenChange?.(false);
        }
      }}
      className={className}
      {...props}
    />
  );
});
AlertDialogAction.displayName = "AlertDialogAction";

/**
 * AlertDialogCancel - Cancel button that closes the dialog.
 */
const AlertDialogCancel = React.forwardRef(({ className, ...props }, ref) => {
  const { onOpenChange } = React.useContext(AlertDialogContext);
  
  return (
    <Button
      ref={ref}
      variant="secondary"
      onClick={(e) => {
        props.onClick?.(e);
        onOpenChange?.(false);
      }}
      className={className}
      {...props}
    />
  );
});
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
