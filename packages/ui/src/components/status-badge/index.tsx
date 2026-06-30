import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { radius, spacing, typography } from '../../theme/index.ts';
import type { StatusColor } from '../../theme/status-colors.ts';

export interface StatusBadgeProps {
  label: string;
  color: StatusColor;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  className?: string;
}

export function StatusBadge({
  label,
  color,
  size = 'md',
  icon,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-semibold',
        size === 'sm' ? typography.fontSize.caption : typography.fontSize.bodySm,
        className,
      )}
      style={{
        color: color.text,
        backgroundColor: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: radius.full,
        padding: size === 'sm' ? `2px ${spacing[2]}` : `${spacing[1]} ${spacing[3]}`,
      }}
      role="status"
      aria-label={label}
    >
      {icon}
      {label}
    </span>
  );
}
