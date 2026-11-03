import { createContext, useContext, useEffect, useId, useRef, type LabelHTMLAttributes, type ReactNode } from 'react';
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
  const fieldRef = useRef<HTMLDivElement>(null);
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;
  const descriptionIds = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  // Legacy forms sometimes place raw HTML inputs inside a wrapper instead of
  // using the shared primitives. Associate those controls without changing
  // existing validation or overwriting caller-owned accessibility attributes.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const controls = Array.from(field.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]), select, textarea',
    ));
    const control = controls.find((item) => item.id === controlId) ?? controls[0];
    if (!control || control.hasAttribute('data-ui')) return;
    if (!control.id) control.id = controlId;
    const prior = (control.getAttribute('aria-describedby') ?? '')
      .split(/\\s+/).filter((id) => id && id !== hintId && id !== errorId);
    const nextIds = Array.from(new Set([...prior, ...(descriptionIds?.split(' ') ?? [])]));
    if (nextIds.length) control.setAttribute('aria-describedby', nextIds.join(' '));
    else control.removeAttribute('aria-describedby');
    if (error) {
      if (control.getAttribute('aria-invalid') !== 'true') {
        control.setAttribute('aria-invalid', 'true');
        control.dataset.fieldManagedInvalid = 'true';
      }
    } else if (control.dataset.fieldManagedInvalid === 'true') {
      control.removeAttribute('aria-invalid');
      delete control.dataset.fieldManagedInvalid;
    }
    if (required) {
      if (control.getAttribute('aria-required') !== 'true') {
        control.setAttribute('aria-required', 'true');
        control.dataset.fieldManagedRequired = 'true';
      }
    } else if (control.dataset.fieldManagedRequired === 'true') {
      control.removeAttribute('aria-required');
      delete control.dataset.fieldManagedRequired;
    }
  });

  return (
    <FieldControlContext.Provider value={{ controlId, descriptionIds, invalid: Boolean(error), required }}>
      <div ref={fieldRef} className={cn('space-y-1.5', className)}>
        <Label htmlFor={controlId} required={required}>{label}</Label>
        {hint && <p id={hintId} className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
        {children}
        {error && <p id={errorId} className="text-xs font-medium text-[var(--color-danger-text)]">{error}</p>}
      </div>
    </FieldControlContext.Provider>
  );
}
