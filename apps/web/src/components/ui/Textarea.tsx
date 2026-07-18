import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs',
        'placeholder:text-slate-400',
        'focus:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        'resize-y',
        invalid
          ? 'border-danger-300 focus-visible:ring-danger-500'
          : 'border-slate-300 focus-visible:border-navy-500 focus-visible:ring-navy-500/40',
        className,
      )}
      {...props}
    />
  );
});