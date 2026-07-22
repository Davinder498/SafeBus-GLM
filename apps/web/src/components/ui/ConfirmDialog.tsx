import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/utils/cn';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Lightweight, accessible confirmation dialog used for destructive actions
 * such as deleting a record. Renders nothing when `open` is false.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape (accessibility) and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const Icon = destructive ? AlertTriangle : Info;
  const iconWrapperClass = destructive
    ? 'bg-danger-50 text-danger-600 ring-danger-100'
    : 'bg-navy-50 text-navy-600 ring-navy-100';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-popover animate-scale-in sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
              iconWrapperClass,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="break-words text-lg font-bold text-slate-900">
              {title}
            </h2>
            <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            type="button"
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
            loading={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
