import { clsx } from 'clsx';
import { colors, typography } from '../../theme/index.ts';

export interface LoadingStateProps {
  variant?: 'spinner' | 'skeleton';
  label?: string;
  /** For skeleton variant: number of rows to show. */
  rows?: number;
  className?: string;
}

export function LoadingState({
  variant = 'spinner',
  label = 'Loading…',
  rows = 3,
  className,
}: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div className={clsx('flex flex-col gap-3', className)} role="status" aria-label={label}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              height: '20px',
              backgroundColor: colors.gray[200],
              borderRadius: '4px',
              width: `${100 - i * 10}%`,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={clsx('flex items-center justify-center gap-3', className)}
      role="status"
      aria-label={label}
    >
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        style={{ color: colors.navy[500] }}
        aria-hidden="true"
      />
      <span style={{ fontSize: typography.fontSize.body, color: colors.gray[600] }}>{label}</span>
    </div>
  );
}
