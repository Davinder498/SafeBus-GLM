import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';
import { useFieldAccessibility } from './Field';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid = false, children, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, 'aria-required': ariaRequired, id, ...props },
  ref,
) {
  const field = useFieldAccessibility();
  const isInvalid = invalid || Boolean(field?.invalid);
  const description = [describedBy, field?.descriptionIds].filter(Boolean).join(' ') || undefined;
  return (
    <div className="relative">
      <select
        ref={ref}
        id={id ?? field?.controlId}
        aria-describedby={description}
        aria-invalid={isInvalid ? true : ariaInvalid}
        aria-required={field?.required ? true : ariaRequired}
        data-ui="select"
        data-invalid={isInvalid || undefined}
        className={cn(
          'block w-full appearance-none rounded-lg border bg-white px-3 py-2.5 pr-9 text-sm text-slate-900 shadow-xs',
          'focus:outline-none focus-visible:ring-2',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
          isInvalid
            ? 'border-danger-300 focus-visible:ring-danger-500'
            : 'border-slate-300 focus-visible:border-navy-500 focus-visible:ring-navy-500/40',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
});
