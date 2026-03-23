import * as React from "react";
import { cn } from "../utils/misc";
import {
  BaseDialogContent,
  DialogRoot,
  type BaseDialogContentProps,
  type DialogOpenChangeReason,
  type DialogRole,
  type DialogSize,
  useDialogBaseContext,
} from "./dialog-base";

interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean, reason?: DialogOpenChangeReason) => void;
  closeOnEscape?: boolean;
  closeOnInteractOutside?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
  children: React.ReactNode;
}

interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

interface BlockingDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean, reason?: DialogOpenChangeReason) => void;
  children: React.ReactNode;
}

export interface DialogContentProps extends BaseDialogContentProps {
  size?: DialogSize;
}

function Dialog({
  open,
  onOpenChange,
  closeOnEscape = true,
  closeOnInteractOutside = true,
  initialFocusRef,
  restoreFocus = true,
  children,
}: DialogProps): JSX.Element {
  return (
    <DialogRoot
      open={open}
      onOpenChange={onOpenChange}
      closeOnEscape={closeOnEscape}
      closeOnInteractOutside={closeOnInteractOutside}
      initialFocusRef={initialFocusRef}
      restoreFocus={restoreFocus}
      role={'dialog' satisfies DialogRole}
    >
      {children}
    </DialogRoot>
  );
}

function BlockingDialog({ open, onOpenChange, children }: BlockingDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      closeOnEscape={false}
      closeOnInteractOutside={false}
      restoreFocus={false}
    >
      {children}
    </Dialog>
  );
}

const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ asChild, children, ...props }, ref) => {
    const context = useDialogBaseContext('DialogTrigger');

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        ...props,
        ref,
        onClick: (event: React.MouseEvent) => {
          const childProps = (children as React.ReactElement<{ onClick?: React.MouseEventHandler }>).props;
          childProps.onClick?.(event);
          context.requestOpenChange(true, 'trigger');
        },
      });
    }

    return (
      <button ref={ref} onClick={() => context.requestOpenChange(true, 'trigger')} {...props}>
        {children}
      </button>
    );
  },
);
DialogTrigger.displayName = 'DialogTrigger';

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>((props, ref) => (
  <BaseDialogContent ref={ref} {...props} />
));
DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('flex flex-col gap-2 p-6 pb-4', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('flex justify-end gap-2 p-6 pt-2', className)} {...props} />;
}

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn('text-lg font-semibold text-theme-primary', className)} {...props} />
  ),
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-theme-secondary', className)} {...props} />
  ),
);
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  BlockingDialog,
  type DialogOpenChangeReason,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};