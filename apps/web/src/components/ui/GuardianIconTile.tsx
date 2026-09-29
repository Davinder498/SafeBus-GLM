import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface GuardianIconTileProps {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-10 w-10 rounded-xl',
  md: 'h-12 w-12 rounded-2xl',
  lg: 'h-14 w-14 rounded-2xl',
};

export function GuardianIconTile({ children, className, size = 'md' }: GuardianIconTileProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center bg-navy-900 text-yellow-300 shadow-sm',
        sizeClasses[size],
        className,
      )}
      data-ui="guardian-icon-tile"
      aria-hidden
    >
      {children}
    </span>
  );
}
