'use client';

import { useCallback, useState } from 'react';

/**
 * Tiny in-app confirm dialog — replaces window.confirm in the admin
 * so the prompt matches the rest of the UI instead of the browser's
 * grey native dialog.
 *
 * Usage:
 *
 *   const { confirm, dialog } = useConfirmDialog();
 *   ...
 *   const ok = await confirm('Delete this item?');
 *   if (!ok) return;
 *   ...
 *   return <>...{dialog}</>;
 *
 * The dialog renders nothing when nothing's pending.
 */
type Pending = {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
};

export function useConfirmDialog() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (
      message: string,
      opts: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean } = {},
    ) =>
      new Promise<boolean>((resolve) => {
        setPending({
          message,
          confirmLabel: opts.confirmLabel ?? 'Confirm',
          cancelLabel: opts.cancelLabel ?? 'Cancel',
          destructive: opts.destructive ?? true,
          resolve,
        });
      }),
    [],
  );

  function close(ok: boolean) {
    if (!pending) return;
    pending.resolve(ok);
    setPending(null);
  }

  const dialog = pending ? (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="dialog">
        <p>{pending.message}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="dialog-cancel"
            onClick={() => close(false)}
          >
            {pending.cancelLabel}
          </button>
          <button
            type="button"
            className="dialog-confirm"
            onClick={() => close(true)}
            autoFocus
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
