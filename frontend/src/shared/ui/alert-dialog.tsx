import * as React from "react";
import { cn } from "../utils/misc";
import { Button, type ButtonProps } from "./button";
import {
  BaseDialogContent,
  DialogRoot,
  useDialogBaseContext,
  type BaseDialogContentProps,
  type DialogOpenChangeReason,
} from "./dialog-base";

interface AlertDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean, reason?: DialogOpenChangeReason) => void;
  closeOnEscape?: boolean;
  closeOnInteractOutside?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
  children: React.ReactNode;
}

function AlertDialog({
  open,
  onOpenChange,
  closeOnEscape = true,
  closeOnInteractOutside = false,
  initialFocusRef,
  restoreFocus = true,
  children,
}: AlertDialogProps): JSX.Element {
  return (
    <DialogRoot
      open={open}
      onOpenChange={onOpenChange}
      closeOnEscape={closeOnEscape}
      closeOnInteractOutside={closeOnInteractOutside}
      initialFocusRef={initialFocusRef}
      restoreFocus={restoreFocus}
      role="alertdialog"
    >
      {children}
    </DialogRoot>
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
    const context = useDialogBaseContext('AlertDialogTrigger');
    
    if (asChild && React.isValidElement(children)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        ...props,
        ref,
        onClick: (e: React.MouseEvent) => {
          (children as React.ReactElement<{ onClick?: React.MouseEventHandler }>).props.onClick?.(e);
          context.requestOpenChange(true, 'trigger');
        },
      });
    }
    
    return (
      <button ref={ref} onClick={() => context.requestOpenChange(true, 'trigger')} {...props}>
        {children}
      </button>
    );
  }
);
AlertDialogTrigger.displayName = "AlertDialogTrigger";

interface AlertDialogContentProps extends BaseDialogContentProps {}

const AlertDialogContent = React.forwardRef<HTMLDivElement, AlertDialogContentProps>(
  (props, ref) => <BaseDialogContent ref={ref} {...props} />
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
    const context = useDialogBaseContext('AlertDialogAction');
    
    return (
      <Button
        ref={ref}
        variant={variant}
        onClick={async (e) => {
          await onClick?.(e);
          // Only close if onClick doesn't prevent default
          if (!e.defaultPrevented) {
            context.requestOpenChange(false, 'action');
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
    const context = useDialogBaseContext('AlertDialogCancel');
    
    return (
      <Button
        ref={ref}
        variant="secondary"
        onClick={(e) => {
          onClick?.(e);
          context.requestOpenChange(false, 'cancel');
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
  type DialogOpenChangeReason,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
