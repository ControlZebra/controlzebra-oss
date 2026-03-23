import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  BlockingDialog,
  Dialog,
  DialogContent,
} from './index';

function WorkflowDialog({ open, onOpenChange }: { open: boolean; onOpenChange?: (open: boolean) => void }): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <button type="button">Return focus here</button>
      <Dialog open={open} onOpenChange={onOpenChange} initialFocusRef={inputRef}>
        <DialogContent>
          <label htmlFor="workflow-name">Name</label>
          <input ref={inputRef} id="workflow-name" />
          <button type="button">Save</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfirmDialog({ open, onOpenChange }: { open: boolean; onOpenChange?: (open: boolean) => void }): JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <p>Delete branch?</p>
        <button type="button">Cancel</button>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AsyncConfirmDialog({
  open,
  onOpenChange,
  onAction,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: () => void;
}): JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <p>Keep this modal open during async work?</p>
        <AlertDialogAction
          variant="default"
          onClick={(event) => {
            event.preventDefault();
            onAction?.();
          }}
        >
          Run async action
        </AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NestedDialogs({
  outerOpen,
  innerOpen,
  onOuterOpenChange,
  onInnerOpenChange,
}: {
  outerOpen: boolean;
  innerOpen: boolean;
  onOuterOpenChange?: (open: boolean) => void;
  onInnerOpenChange?: (open: boolean) => void;
}): JSX.Element {
  return (
    <>
      <Dialog open={outerOpen} onOpenChange={onOuterOpenChange}>
        <DialogContent>
          <button type="button">Outer action</button>
        </DialogContent>
      </Dialog>
      <Dialog open={innerOpen} onOpenChange={onInnerOpenChange}>
        <DialogContent>
          <button type="button">Inner action</button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BlockingWorkflowDialog({ open, onOpenChange }: { open: boolean; onOpenChange?: (open: boolean) => void }): JSX.Element {
  return (
    <BlockingDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <p>Installing packages</p>
        <button type="button">Spinner</button>
      </DialogContent>
    </BlockingDialog>
  );
}

describe('shared dialog primitives', () => {
  it('focuses the requested initial element and restores focus on close', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<WorkflowDialog open={false} onOpenChange={onOpenChange} />);

    const trigger = screen.getByRole('button', { name: 'Return focus here' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(<WorkflowDialog open={true} onOpenChange={onOpenChange} />);

    const input = await screen.findByLabelText('Name');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });

    rerender(<WorkflowDialog open={false} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('allows workflow dialogs to close when clicking the backdrop', async () => {
    const onOpenChange = vi.fn();
    render(<WorkflowDialog open={true} onOpenChange={onOpenChange} />);

    const dialog = await screen.findByRole('dialog');
    const overlay = dialog.parentElement?.previousElementSibling as HTMLElement | null;

    expect(overlay).not.toBeNull();
    fireEvent.click(overlay as HTMLElement);

    expect(onOpenChange).toHaveBeenCalledWith(false, 'interact-outside');
  });

  it('keeps alert dialogs modal on backdrop click but closes on escape', async () => {
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open={true} onOpenChange={onOpenChange} />);

    const dialog = await screen.findByRole('alertdialog');
    const overlay = dialog.parentElement?.previousElementSibling as HTMLElement | null;

    expect(overlay).not.toBeNull();
    fireEvent.click(overlay as HTMLElement);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false, 'escape-key');
  });

  it('reports action dismissal reasons for alert dialog actions', async () => {
    const onOpenChange = vi.fn();

    render(
      <AlertDialog open={true} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogAction>Confirm</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false, 'action');
    });
  });

  it('lets alert actions keep the modal open when they prevent the default close', async () => {
    const onOpenChange = vi.fn();
    const onAction = vi.fn();

    render(<AsyncConfirmDialog open={true} onOpenChange={onOpenChange} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run async action' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('locks body scroll while a dialog is open and restores it after close', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<WorkflowDialog open={false} onOpenChange={onOpenChange} />);

    expect(document.body.style.overflow).toBe('');

    rerender(<WorkflowDialog open={true} onOpenChange={onOpenChange} />);

    await screen.findByRole('dialog');
    await waitFor(() => {
      expect(document.body.style.overflow).toBe('hidden');
    });

    rerender(<WorkflowDialog open={false} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('');
    });
  });

  it('only lets the topmost dialog close on escape when dialogs are stacked', async () => {
    const onOuterOpenChange = vi.fn();
    const onInnerOpenChange = vi.fn();
    const { rerender } = render(
      <NestedDialogs
        outerOpen={true}
        innerOpen={true}
        onOuterOpenChange={onOuterOpenChange}
        onInnerOpenChange={onInnerOpenChange}
      />,
    );

    await screen.findByRole('button', { name: 'Inner action' });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onInnerOpenChange).toHaveBeenCalledWith(false, 'escape-key');
    expect(onOuterOpenChange).not.toHaveBeenCalled();

    rerender(
      <NestedDialogs
        outerOpen={true}
        innerOpen={false}
        onOuterOpenChange={onOuterOpenChange}
        onInnerOpenChange={onInnerOpenChange}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOuterOpenChange).toHaveBeenCalledWith(false, 'escape-key');
  });

  it('only lets the topmost dialog close on backdrop click when dialogs are stacked', async () => {
    const onOuterOpenChange = vi.fn();
    const onInnerOpenChange = vi.fn();
    const { rerender } = render(
      <NestedDialogs
        outerOpen={true}
        innerOpen={true}
        onOuterOpenChange={onOuterOpenChange}
        onInnerOpenChange={onInnerOpenChange}
      />,
    );

    const innerButton = await screen.findByRole('button', { name: 'Inner action' });
    const innerDialog = innerButton.closest('[role="dialog"]') as HTMLElement | null;
    const innerOverlay = innerDialog?.parentElement?.previousElementSibling as HTMLElement | null;

    expect(innerOverlay).not.toBeNull();
    fireEvent.click(innerOverlay as HTMLElement);
    expect(onInnerOpenChange).toHaveBeenCalledWith(false, 'interact-outside');
    expect(onOuterOpenChange).not.toHaveBeenCalled();

    rerender(
      <NestedDialogs
        outerOpen={true}
        innerOpen={false}
        onOuterOpenChange={onOuterOpenChange}
        onInnerOpenChange={onInnerOpenChange}
      />,
    );

    const outerButton = await screen.findByRole('button', { name: 'Outer action' });
    const outerDialog = outerButton.closest('[role="dialog"]') as HTMLElement | null;
    const outerOverlay = outerDialog?.parentElement?.previousElementSibling as HTMLElement | null;

    expect(outerOverlay).not.toBeNull();
    fireEvent.click(outerOverlay as HTMLElement);
    expect(onOuterOpenChange).toHaveBeenCalledWith(false, 'interact-outside');
  });

  it('keeps body scroll locked until the last stacked dialog closes', async () => {
    const onOuterOpenChange = vi.fn();
    const onInnerOpenChange = vi.fn();
    const { rerender } = render(
      <NestedDialogs
        outerOpen={true}
        innerOpen={true}
        onOuterOpenChange={onOuterOpenChange}
        onInnerOpenChange={onInnerOpenChange}
      />,
    );

    await screen.findByRole('button', { name: 'Inner action' });
    await waitFor(() => {
      expect(document.body.style.overflow).toBe('hidden');
    });

    rerender(
      <NestedDialogs
        outerOpen={true}
        innerOpen={false}
        onOuterOpenChange={onOuterOpenChange}
        onInnerOpenChange={onInnerOpenChange}
      />,
    );

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('hidden');
    });

    rerender(
      <NestedDialogs
        outerOpen={false}
        innerOpen={false}
        onOuterOpenChange={onOuterOpenChange}
        onInnerOpenChange={onInnerOpenChange}
      />,
    );

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('');
    });
  });

  it('keeps blocking dialogs closed to escape and backdrop dismissal', async () => {
    const onOpenChange = vi.fn();
    render(<BlockingWorkflowDialog open={true} onOpenChange={onOpenChange} />);

    const dialog = await screen.findByRole('dialog');
    const overlay = dialog.parentElement?.previousElementSibling as HTMLElement | null;

    expect(overlay).not.toBeNull();
    fireEvent.click(overlay as HTMLElement);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});