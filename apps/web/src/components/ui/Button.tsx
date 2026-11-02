import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

const buttonVariants = cva(
  'inline-flex min-w-0 items-center justify-center gap-2 break-words rounded-lg text-center font-semibold transition-colors transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--color-action)] text-[var(--color-on-action)] shadow-sm hover:bg-[var(--color-action-hover)] focus-visible:ring-[var(--color-focus)]',
        secondary:
          'bg-[var(--color-selection)] text-[var(--color-action)] hover:bg-[var(--color-raised)] focus-visible:ring-[var(--color-focus)] border border-[var(--color-border)]',
        danger:
          'bg-[var(--color-danger-strong)] text-[var(--color-on-strong)] shadow-sm hover:brightness-90 focus-visible:ring-[var(--color-focus)]',
        ghost:
          'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-navy-500',
        success:
          'bg-[var(--color-success-strong)] text-[var(--color-on-strong)] shadow-sm hover:brightness-90 focus-visible:ring-[var(--color-focus)]',
        outline:
          'border border-[var(--color-border)] bg-[var(--color-surface)] text-slate-700 shadow-xs hover:bg-[var(--color-surface-subtle)] hover:text-slate-900 focus-visible:ring-navy-500',
      },
      size: {
        sm: 'min-h-9 px-3 py-2 text-sm',
        md: 'min-h-11 px-4 py-2.5 text-sm',
        lg: 'min-h-12 px-6 py-3 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export const buttonClass = buttonVariants;

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  /** Optional icon rendered after the label. */
  rightIcon?: ReactNode;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), fullWidth && 'w-full', className)}
      data-ui="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
