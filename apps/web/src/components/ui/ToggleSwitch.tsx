import { cn } from '@/utils/cn';

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ checked, disabled, label, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      data-ui="notification-toggle"
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors motion-reduce:transition-none',
          checked ? 'bg-navy-700' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
}
