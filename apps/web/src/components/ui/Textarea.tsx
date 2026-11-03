import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';
import { useFieldAccessibility } from './Field';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, rows = 4, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, 'aria-required': ariaRequired, id, ...props },
  ref,
) {
  const field = useFieldAccessibility();
  const isInvalid = invalid || Boolean(field?.invalid);
  const description = [describedBy, field?.descriptionIds].filter(Boolean).join(' ') || undefined;
  return (
    <textarea
      ref={ref}
      id={id ?? field?.controlId}
      aria-describedby={description}
      aria-invalid={isInvalid ? true : ariaInvalid}
      aria-required={field?.required ? true : ariaRequired}
      rows={rows}
      data-ui="textarea"
      data-invalid={isInvalid || undefined}
      className={cn(
        'block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs',
        'placeholder:text-slate-400',
        'focus:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        'resize-y',
        isInvalid
          ? 'border-danger-300 focus-visible:ring-danger-500'
          : 'border-slate-300 focus-visible:border-navy-500 focus-visible:ring-navy-500/40',
        className,
      )}
      {...props}
    />
  );
});
