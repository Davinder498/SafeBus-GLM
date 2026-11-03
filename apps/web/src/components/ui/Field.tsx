import { createContext, useContext, useId, type LabelHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  hint?: ReactNode;
  required?: boolean;
}

export function Label({ children, hint, required = false, className, ...props }: LabelProps) {
  return (
    <label className={cn('flex items-center gap-2 text-sm font-medium text-slate-700', className)} {...props}>
      <span>
        {children}
        {required && <span className="ml-0.5 text-danger-500" aria-hidden>*</span>}
      </span>
      {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

interface FieldContextValue {
  controlId: string;
  descriptionIds: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldControlContext = createContext<FieldContextValue | null>(null);

/** Shared Input/Select/Textarea primitives associate their validation text automatically. */
export function useFieldAccessibility() {
  return useContext(FieldControlContext);
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

/** A labelled field with persistent hint/error IDs for assistive technologies. */
export function Field({ label, htmlFor, hint, error, required = false, children, className }: FieldProps) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;
  const descriptionIds = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <FieldControlContext.Provider value={{ controlId, descriptionIds, invalid: Boolean(error), required }}>
      <div className={cn('space-y-1.5', className)}>
        <Label htmlFor={controlId} required={required}>{label}</Label>
        {hint && <p id={hintId} className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
        {children}
        {error && <p id={errorId} className="text-xs font-medium text-[var(--color-danger-text)]">{error}</p>}
      </div>
    </FieldControlContext.Provider>
  );
}
