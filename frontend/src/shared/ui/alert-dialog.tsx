/**
 * AlertDialog - shadcn-style confirmation dialog.
 * A controlled modal for destructive actions that require user confirmation.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/misc";
import { Button, type ButtonProps } from "./button";

interface AlertDialogContextValue {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  dialogId: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const openDialogStack: string[] = [];
let originalBodyOverflow = "";

function pushDialog(dialogId: string): void {
  if (typeof document === "undefined" || openDialogStack.includes(dialogId)) {
    return;
  }

  if (openDialogStack.length === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  openDialogStack.push(dialogId);
}

function removeDialog(dialogId: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const dialogIndex = openDialogStack.lastIndexOf(dialogId);
  if (dialogIndex !== -1) {
    openDialogStack.splice(dialogIndex, 1);
  }

  if (openDialogStack.length === 0) {
    document.body.style.overflow = originalBodyOverflow;
    originalBodyOverflow = "";
  }
}

function isTopmostDialog(dialogId: string): boolean {
  return openDialogStack[openDialogStack.length - 1] === dialogId;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
  );
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
  const dialogId = React.useId();

  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange, dialogId }}>
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.cloneElement(children as React.ReactElement<any>, {
        ...props,
        ref,
        onClick: (e: React.MouseEvent) => {
          (children as React.ReactElement<{ onClick?: React.MouseEventHandler }>).props.onClick?.(e);
          context?.onOpenChange?.(true);
        },
      } as any);
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
  
  if (!context?.open || typeof document === "undefined") return null;
  
  return createPortal(
    <div className="fixed inset-0 z-50">
      {children}
    </div>,
    document.body,
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
        "fixed inset-0 bg-black/75 backdrop-blur-[1px] animate-in fade-in-0",
        className
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
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
    const localRef = React.useRef<HTMLDivElement | null>(null);

    const setRefs = React.useCallback((node: HTMLDivElement | null) => {
      localRef.current = node;

      if (typeof ref === "function") {
        ref(node);
        return;
      }

      if (ref) {
        ref.current = node;
      }
    }, [ref]);

    React.useEffect(() => {
      if (!context?.open || !context.dialogId) {
        return undefined;
      }

      pushDialog(context.dialogId);

      const previouslyFocused = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

      const focusInitialElement = (): void => {
        const contentElement = localRef.current;
        if (!contentElement) {
          return;
        }

        const firstFocusable = getFocusableElements(contentElement)[0] || contentElement;
        firstFocusable.focus();
      };

      const handleKeyDown = (event: KeyboardEvent): void => {
        if (!isTopmostDialog(context.dialogId)) {
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          context.onOpenChange?.(false);
          return;
        }

        if (event.key !== "Tab") {
          return;
        }

        const contentElement = localRef.current;
        if (!contentElement) {
          return;
        }

        const focusableElements = getFocusableElements(contentElement);
        if (focusableElements.length === 0) {
          event.preventDefault();
          contentElement.focus();
          return;
        }

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (activeElement === firstFocusable || activeElement === contentElement) {
            event.preventDefault();
            lastFocusable.focus();
          }
          return;
        }

        if (activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      };

      const handleFocusIn = (event: FocusEvent): void => {
        const contentElement = localRef.current;
        if (!contentElement || !isTopmostDialog(context.dialogId)) {
          return;
        }

        if (contentElement.contains(event.target as Node)) {
          return;
        }

        const firstFocusable = getFocusableElements(contentElement)[0] || contentElement;
        firstFocusable.focus();
      };

      const animationFrame = window.requestAnimationFrame(focusInitialElement);
      document.addEventListener("keydown", handleKeyDown, true);
      document.addEventListener("focusin", handleFocusIn);

      return () => {
        window.cancelAnimationFrame(animationFrame);
        document.removeEventListener("keydown", handleKeyDown, true);
        document.removeEventListener("focusin", handleFocusIn);
        removeDialog(context.dialogId);
        previouslyFocused?.focus();
      };
    }, [context]);
    
    return (
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <div
            ref={setRefs}
            className={cn(
              "relative w-full max-w-md bg-theme-surface border border-theme-default rounded-lg shadow-xl",
              "animate-in fade-in-0 zoom-in-95 duration-200",
              className
            )}
            role="alertdialog"
            aria-modal="true"
            tabIndex={-1}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
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
