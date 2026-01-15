/**
 * AlertDialog - shadcn-style confirmation dialog.
 * A controlled modal for destructive actions that require user confirmation.
 */
import * as React from "react";
import { cn } from "../../lib/utils";
import { Button, type ButtonProps } from "./button";

interface AlertDialogContextValue {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Context for managing dialog state
const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null);

interface AlertDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * AlertDialog - Root component that manages open/close state.
 */
function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

interface AlertDialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

/**
 * AlertDialogTrigger - Button that opens the dialog.
 */
const AlertDialogTrigger = React.forwardRef<HTMLButtonElement, AlertDialogTriggerProps>(
  ({ asChild, children, ...props }, ref) => {
    const context = React.useContext(AlertDialogContext);
    
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<{ onClick?: React.MouseEventHandler }>, {
        ...props,
        ref,
        onClick: (e: React.MouseEvent) => {
          (children as React.ReactElement<{ onClick?: React.MouseEventHandler }>).props.onClick?.(e);
          context?.onOpenChange?.(true);
        },
      });
    }
    
    return (
      <button ref={ref} onClick={() => context?.onOpenChange?.(true)} {...props}>
        {children}
      </button>
    );
  }
);
AlertDialogTrigger.displayName = "AlertDialogTrigger";

interface AlertDialogPortalProps {
  children: React.ReactNode;
}

/**
 * AlertDialogPortal - Renders dialog content in a portal.
 */
function AlertDialogPortal({ children }: AlertDialogPortalProps) {
  const context = React.useContext(AlertDialogContext);
  
  if (!context?.open) return null;
  
  return (
    <div className="fixed inset-0 z-50">
      {children}
    </div>
  );
}

interface AlertDialogOverlayProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * AlertDialogOverlay - Dark backdrop behind the dialog.
 */
const AlertDialogOverlay = React.forwardRef<HTMLDivElement, AlertDialogOverlayProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0",
        className
      )}
      {...props}
    />
  )
);
AlertDialogOverlay.displayName = "AlertDialogOverlay";

interface AlertDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * AlertDialogContent - Main dialog container.
 */
const AlertDialogContent = React.forwardRef<HTMLDivElement, AlertDialogContentProps>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(AlertDialogContext);
    
    // Close on Escape key
    React.useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          context?.onOpenChange?.(false);
        }
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, [context]);
    
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
  }
);
AlertDialogContent.displayName = "AlertDialogContent";

interface AlertDialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * AlertDialogHeader - Container for title and description.
 */
function AlertDialogHeader({ className, ...props }: AlertDialogHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-6 pb-4", className)}
      {...props}
    />
  );
}

interface AlertDialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * AlertDialogFooter - Container for action buttons.
 */
function AlertDialogFooter({ className, ...props }: AlertDialogFooterProps) {
  return (
    <div
      className={cn("flex justify-end gap-2 p-6 pt-2", className)}
      {...props}
    />
  );
}

interface AlertDialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

/**
 * AlertDialogTitle - Dialog title.
 */
const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, AlertDialogTitleProps>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn("text-lg font-semibold text-theme-primary", className)}
      {...props}
    />
  )
);
AlertDialogTitle.displayName = "AlertDialogTitle";

interface AlertDialogDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

/**
 * AlertDialogDescription - Dialog description text.
 */
const AlertDialogDescription = React.forwardRef<HTMLParagraphElement, AlertDialogDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-sm text-theme-secondary", className)}
      {...props}
    />
  )
);
AlertDialogDescription.displayName = "AlertDialogDescription";

interface AlertDialogActionProps extends ButtonProps {}

/**
 * AlertDialogAction - Primary action button (destructive by default).
 */
const AlertDialogAction = React.forwardRef<HTMLButtonElement, AlertDialogActionProps>(
  ({ className, variant = "destructive", onClick, ...props }, ref) => {
    const context = React.useContext(AlertDialogContext);
    
    return (
      <Button
        ref={ref}
        variant={variant}
        onClick={async (e) => {
          await onClick?.(e);
          // Only close if onClick doesn't prevent default
          if (!e.defaultPrevented) {
            context?.onOpenChange?.(false);
          }
        }}
        className={className}
        {...props}
      />
    );
  }
);
AlertDialogAction.displayName = "AlertDialogAction";

interface AlertDialogCancelProps extends ButtonProps {}

/**
 * AlertDialogCancel - Cancel button that closes the dialog.
 */
const AlertDialogCancel = React.forwardRef<HTMLButtonElement, AlertDialogCancelProps>(
  ({ className, onClick, ...props }, ref) => {
    const context = React.useContext(AlertDialogContext);
    
    return (
      <Button
        ref={ref}
        variant="secondary"
        onClick={(e) => {
          onClick?.(e);
          context?.onOpenChange?.(false);
        }}
        className={className}
        {...props}
      />
    );
  }
);
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
