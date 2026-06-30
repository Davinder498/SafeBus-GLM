import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { colors, spacing, typography } from '../../theme/index.ts';
import { Button } from '../button/index.tsx';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  details?: ReactNode;
  className?: string;
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Try again',
  details,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={clsx('flex flex-col items-center justify-center text-center', className)}
      style={{ padding: `${spacing[8]} ${spacing[4]}` }}
      role="alert"
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: colors.red[50],
          color: colors.red[600],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          marginBottom: spacing[4],
        }}
        aria-hidden="true"
      >
        !
      </div>
      <p
        style={{
          fontSize: typography.fontSize.body,
          color: colors.gray[800],
          marginBottom: spacing[2],
          maxWidth: '400px',
        }}
      >
        {message}
      </p>
      {details && (
        <div
          style={{
            fontSize: typography.fontSize.bodySm,
            color: colors.gray[500],
            marginTop: spacing[2],
          }}
        >
          {details}
        </div>
      )}
      {onRetry && (
        <div style={{ marginTop: spacing[6] }}>
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
