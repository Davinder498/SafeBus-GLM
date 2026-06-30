import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { spacing, typography, colors } from '../../theme/index.ts';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx('flex flex-col items-center justify-center text-center', className)}
      style={{ padding: `${spacing[8]} ${spacing[4]}` }}
      role="status"
    >
      {icon && (
        <div style={{ marginBottom: spacing[4], color: colors.gray[400] }} aria-hidden="true">
          {icon}
        </div>
      )}
      <h3
        style={{
          fontSize: typography.fontSize.h3,
          fontWeight: typography.fontWeight.semibold,
          color: colors.gray[800],
          marginBottom: spacing[2],
        }}
      >
        {title}
      </h3>
      {message && (
        <p
          style={{
            fontSize: typography.fontSize.body,
            color: colors.gray[500],
            maxWidth: '400px',
            lineHeight: typography.lineHeight.relaxed,
          }}
        >
          {message}
        </p>
      )}
      {action && <div style={{ marginTop: spacing[6] }}>{action}</div>}
    </div>
  );
}
