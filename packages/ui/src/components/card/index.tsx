import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { radius, shadow, spacing, colors } from '../../theme/index.ts';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: string;
  shadow?: keyof typeof shadow;
  children: ReactNode;
}

const paddingMap: Record<string, string> = {
  none: '0px',
  ...Object.fromEntries(Object.entries(spacing).map(([k, v]) => [k, v])),
};

export function Card({
  padding = '4',
  shadow: shadowKey = 'sm',
  className,
  children,
  style,
  ...props
}: CardProps) {
  return (
    <div
      className={clsx('bg-white', className)}
      style={{
        borderRadius: radius.default,
        boxShadow: shadow[shadowKey],
        padding: paddingMap[padding] ?? spacing[4],
        border: `1px solid ${colors.gray[200]}`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
