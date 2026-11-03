import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';
import { useFieldAccessibility } from './Field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders a red error ring + error message styling. */
  invalid?: boolean;
}

/**
 * Shared text input primitive. Purely presentational — no business logic.
 * Use together with the `Label` + `Field` helpers for accessible forms.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, type = 'text', 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, 'aria-required': ariaRequired, id, ...props },
  ref,
) {
  const field = useFieldAccessibility();
  const isInvalid = invalid || Boolean(field?.invalid);
  const description = [describedBy, field?.descriptionIds].filter(Boolean).join(' ') || undefined;
  return (
    <input
      ref={ref}
      id={id ?? field?.controlId}
      aria-describedby={description}
      aria-invalid={isInvalid ? true : ariaInvalid}
      aria-required={field?.required ? true : ariaRequired}
      type={type}
      data-ui="input"
      data-invalid={isInvalid || undefined}
      className={cn(
        'block min-h-11 w-full min-w-0 rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-xs sm:text-sm',
        'placeholder:text-slate-400',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        isInvalid
          ? 'border-danger-300 focus-visible:ring-danger-500'
          : 'border-slate-300 focus-visible:border-navy-500 focus-visible:ring-navy-500/40',
        className,
      )}
      {...props}
    />
  );
});
