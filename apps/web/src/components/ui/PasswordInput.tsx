import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from './Input';

export function PasswordInput(props: InputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`pr-14 ${props.className ?? ''}`}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-[var(--color-text-muted)]"
        onClick={() => setVisible(!visible)}
      >
        {visible ? (
          <EyeOff className="h-5 w-5" aria-hidden />
        ) : (
          <Eye className="h-5 w-5" aria-hidden />
        )}
      </button>
    </div>
  );
}
