import type { LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  /** Optional hint rendered after the label text. */
  hint?: ReactNode;
  /** Required asterisk indicator. */
  required?: boolean;
}

export function Label({ children, hint, required = false, className, ...props }: LabelProps) {
  return (
    <label
      className={cn('flex items-center gap-2 text-sm font-medium text-slate-700', className)}
      {...props}
    >
      <span>
        {children}
        {required && <span className="ml-0.5 text-danger-500" aria-hidden>*</span>}
      </span>
      {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
    </label>
  );
}

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Composable form field wrapper: renders a label, the control, optional hint,
 * and error message with consistent spacing. Purely presentational.
 */
export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} hint={hint} required={required}>
        {label}
      </Label>
      {children}
      {error && <p className="text-xs font-medium text-danger-600">{error}</p>}
    </div>
  );
}