import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/misc";

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
export type DialogRole = 'dialog' | 'alertdialog';
export type DialogOpenChangeReason = 'trigger' | 'action' | 'cancel' | 'escape-key' | 'interact-outside';
export type DialogOverlayTone = 'default' | 'emphasized';

interface DialogBaseContextValue {
  open: boolean;
  onOpenChange?: (open: boolean, reason?: DialogOpenChangeReason) => void;
  requestOpenChange: (open: boolean, reason?: DialogOpenChangeReason) => void;
  closeOnEscape: boolean;
  closeOnInteractOutside: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  restoreFocus: boolean;
  dialogId: string;
  role: DialogRole;
}

interface DialogRootProps {
  open: boolean;
  onOpenChange?: (open: boolean, reason?: DialogOpenChangeReason) => void;
  closeOnEscape?: boolean;
  closeOnInteractOutside?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
  role?: DialogRole;
  children: React.ReactNode;
}

export interface BaseDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: DialogSize;
  containerClassName?: string;
  overlayTone?: DialogOverlayTone;
  overlayClassName?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const DIALOG_SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-[min(100vw-2rem,96rem)] h-[calc(100vh-2rem)]',
};

const DIALOG_OVERLAY_TONE_CLASSES: Record<DialogOverlayTone, string> = {
  default: 'bg-black/75 backdrop-blur-[1px]',
  emphasized: 'bg-black/80 backdrop-blur-[1px]',
};

const openDialogStack: string[] = [];
let originalBodyOverflow = "";

const DialogBaseContext = React.createContext<DialogBaseContextValue | null>(null);

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
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
  );
}

function isFocusableElement(element: HTMLElement | null | undefined): element is HTMLElement {
  return !!element
    && !element.hasAttribute('disabled')
    && element.getAttribute('aria-hidden') !== 'true'
    && element.tabIndex !== -1;
}

export function useDialogBaseContext(componentName: string): DialogBaseContextValue {
  const context = React.useContext(DialogBaseContext);

  if (!context) {
    throw new Error(`${componentName} must be used within a dialog root`);
  }

  return context;
}

export function DialogRoot({
  open,
  onOpenChange,
  closeOnEscape = true,
  closeOnInteractOutside = true,
  initialFocusRef,
  restoreFocus = true,
  role = 'dialog',
  children,
}: DialogRootProps): JSX.Element {
  const dialogId = React.useId();
  const requestOpenChange = React.useCallback((nextOpen: boolean, reason?: DialogOpenChangeReason): void => {
    onOpenChange?.(nextOpen, reason);
  }, [onOpenChange]);

  const value = React.useMemo<DialogBaseContextValue>(() => ({
    open,
    onOpenChange,
    requestOpenChange,
    closeOnEscape,
    closeOnInteractOutside,
    initialFocusRef,
    restoreFocus,
    dialogId,
    role,
  }), [open, onOpenChange, requestOpenChange, closeOnEscape, closeOnInteractOutside, initialFocusRef, restoreFocus, dialogId, role]);

  return (
    <DialogBaseContext.Provider value={value}>
      {children}
    </DialogBaseContext.Provider>
  );
}

export function DialogPortal({ children }: { children: React.ReactNode }): React.ReactPortal | null {
  const context = useDialogBaseContext('DialogPortal');

  if (!context.open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      {children}
    </div>,
    document.body,
  );
}

export const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onMouseDown, onClick, ...props }, ref) => {
    const context = useDialogBaseContext('DialogOverlay');

    const handleOverlayClose = (event: React.MouseEvent<HTMLDivElement>): void => {
      event.preventDefault();
      event.stopPropagation();

      if (!context.closeOnInteractOutside || !isTopmostDialog(context.dialogId)) {
        return;
      }

      context.requestOpenChange(false, 'interact-outside');
    };

    return (
      <div
        ref={ref}
        className={cn(
          'fixed inset-0 animate-in fade-in-0',
          DIALOG_OVERLAY_TONE_CLASSES.default,
          className,
        )}
        onMouseDown={(event) => {
          onMouseDown?.(event);
          handleOverlayClose(event);
        }}
        onClick={(event) => {
          onClick?.(event);
          handleOverlayClose(event);
        }}
        {...props}
      />
    );
  },
);
DialogOverlay.displayName = 'DialogOverlay';

export const BaseDialogContent = React.forwardRef<HTMLDivElement, BaseDialogContentProps>(
  ({ className, children, size = 'md', containerClassName, overlayTone = 'default', overlayClassName, ...props }, ref) => {
    const context = useDialogBaseContext('DialogContent');
    const localRef = React.useRef<HTMLDivElement | null>(null);

    const setRefs = React.useCallback((node: HTMLDivElement | null) => {
      localRef.current = node;

      if (typeof ref === 'function') {
        ref(node);
        return;
      }

      if (ref) {
        ref.current = node;
      }
    }, [ref]);

    React.useEffect(() => {
      if (!context.open) {
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

        const requestedInitialFocus = context.initialFocusRef?.current;
        const firstFocusable = getFocusableElements(contentElement)[0] || contentElement;
        const focusTarget = isFocusableElement(requestedInitialFocus) ? requestedInitialFocus : firstFocusable;
        focusTarget.focus();
      };

      const handleKeyDown = (event: KeyboardEvent): void => {
        if (!isTopmostDialog(context.dialogId)) {
          return;
        }

        if (event.key === 'Escape' && context.closeOnEscape) {
          event.preventDefault();
          event.stopPropagation();
          context.requestOpenChange(false, 'escape-key');
          return;
        }

        if (event.key !== 'Tab') {
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

        const requestedInitialFocus = context.initialFocusRef?.current;
        const firstFocusable = getFocusableElements(contentElement)[0] || contentElement;
        const focusTarget = isFocusableElement(requestedInitialFocus) ? requestedInitialFocus : firstFocusable;
        focusTarget.focus();
      };

      const animationFrame = window.requestAnimationFrame(focusInitialElement);
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('focusin', handleFocusIn);

      return () => {
        window.cancelAnimationFrame(animationFrame);
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('focusin', handleFocusIn);
        removeDialog(context.dialogId);

        if (context.restoreFocus) {
          previouslyFocused?.focus();
        }
      };
    }, [context]);

    return (
      <DialogPortal>
        <DialogOverlay className={cn(DIALOG_OVERLAY_TONE_CLASSES[overlayTone], overlayClassName)} />
        <div
          className={cn('fixed inset-0 flex items-center justify-center p-4', containerClassName)}
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
              'relative w-full border border-theme-default bg-theme-surface shadow-xl',
              'rounded-lg animate-in fade-in-0 zoom-in-95 duration-200',
              DIALOG_SIZE_CLASSES[size],
              className,
            )}
            role={context.role}
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
      </DialogPortal>
    );
  },
);
BaseDialogContent.displayName = 'BaseDialogContent';