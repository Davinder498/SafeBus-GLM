import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid = false, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'block w-full appearance-none rounded-lg border bg-white px-3 py-2.5 pr-9 text-sm text-slate-900 shadow-xs',
          'focus:outline-none focus-visible:ring-2',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
          invalid
            ? 'border-danger-300 focus-visible:ring-danger-500'
            : 'border-slate-300 focus-visible:border-navy-500 focus-visible:ring-navy-500/40',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
    </div>
  );
});