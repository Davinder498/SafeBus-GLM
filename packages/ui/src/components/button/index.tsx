import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { colors, radius, spacing, typography } from '../../theme/index.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Makes the button full-width (useful on mobile). */
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `bg-[${colors.navy[700]}] text-white hover:bg-[${colors.navy[800]}]`,
  secondary: `bg-[${colors.navy[100]}] text-[${colors.navy[700]}] hover:bg-[${colors.navy[200]}]`,
  danger: `bg-[${colors.red[600]}] text-white hover:bg-[${colors.red[700]}]`,
  ghost: `bg-transparent text-[${colors.navy[700]}] hover:bg-[${colors.navy[100]}]`,
  success: `bg-[${colors.green[600]}] text-white hover:bg-[${colors.green[700]}]`,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: `${spacing[2]} ${spacing[3]} ${typography.fontSize.bodySm}`,
  md: `${spacing[3]} ${spacing[4]} ${typography.fontSize.button}`,
  lg: `${spacing[4]} ${spacing[6]} ${typography.fontSize.button}`,
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      style={{
        borderRadius: radius.default,
        minHeight: size === 'lg' ? '48px' : '44px', // WCAG 2.1 AA touch target
      }}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
