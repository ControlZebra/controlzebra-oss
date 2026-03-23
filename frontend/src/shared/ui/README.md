# shared/ui

Reusable UI primitives and composition-safe wrappers.

## Modal Usage

All modal surfaces in the desktop app should be built on the shared dialog layer in this folder.

### Modal Classes

- `AlertDialog`: confirmation and destructive decision points. Default policy is escape closes, backdrop click does not.
- `Dialog`: workflow and form modals. Default policy is escape closes, backdrop click closes unless the flow is risky enough to opt out.
- `BlockingDialog`: long-running operational flows such as setup, install, repair, or sync. Default policy is no escape close and no backdrop close.

### Required Contract

- Expose modal state as `open` and `onOpenChange`.
- `onOpenChange` can inspect an optional reason: `trigger`, `action`, `cancel`, `escape-key`, or `interact-outside`.
- Prefer `initialFocusRef` for forms or search-first workflows.
- Use `AlertDialogAction` and `AlertDialogCancel` when the action should automatically close the modal.
- Use a plain `Button` only when the action intentionally stays open while app logic runs.

### Shared Variants

- Prefer the shared `size` prop over hand-written `max-w-*` classes when a standard dialog width fits.
- Use `overlayTone="emphasized"` for blocking or high-attention flows instead of restyling the overlay ad hoc.

### Rules

- Do not render a custom fullscreen modal wrapper or `createPortal` outside `shared/ui` unless there is a documented exception.
- Keep dismissibility explicit through dialog props instead of encoding it indirectly with no-op handlers.
- Keep feature tests focused on business behavior. Shared dialog mechanics should be covered in [dialog.test.tsx](./dialog.test.tsx).
