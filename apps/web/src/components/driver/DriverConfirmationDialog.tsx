import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';

export function DriverConfirmationDialog({
  title,
  children,
  confirmLabel,
  busy,
  confirmDisabled = false,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  confirmDisabled?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    cancel.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      // Remove native modal inertness before restoring the originating card.
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-popover backdrop:bg-slate-900/60 sm:p-6"
      data-ui="dialog-panel"
      data-testid="driver-action-confirmation"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]',
          ),
        ).filter((control) => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !confirmDisabled) onConfirm();
        }}
      >
        <h2 id={titleId} className="text-xl font-bold text-navy-900">
          {title}
        </h2>
        <div className="mt-4 space-y-4">{children}</div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            ref={cancel}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-12 rounded-lg border border-[var(--color-border)] px-4 py-3 font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-50"
          >
            Go back
          </button>
          <Button
            type="submit"
            variant={destructive ? 'danger' : 'primary'}
            loading={busy}
            disabled={confirmDisabled}
          >
            {busy ? 'Saving…' : confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
