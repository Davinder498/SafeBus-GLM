import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders a red error ring + error message styling. */
  invalid?: boolean;
}

/**
 * Shared text input primitive. Purely presentational — no business logic.
 * Use together with the `Label` + `Field` helpers for accessible forms.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs',
        'placeholder:text-slate-400',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        invalid
          ? 'border-danger-300 focus-visible:ring-danger-500'
          : 'border-slate-300 focus-visible:border-navy-500 focus-visible:ring-navy-500/40',
        className,
      )}
      {...props}
    />
  );
});