import { Bus } from 'lucide-react';
import { cn } from '@/utils/cn';

interface BrandMarkProps {
  className?: string;
  iconClassName?: string;
  tone?: 'primary' | 'glass';
}

/**
 * Shared brand tile. The web surface keeps the existing outline bus while the
 * native-mobile stylesheet replaces it with the approved yellow bus mark.
 */
export function BrandMark({ className, iconClassName, tone = 'primary' }: BrandMarkProps) {
  return (
    <span
      className={cn(
        'safebus-brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm',
        tone === 'glass' ? 'bg-white/10 backdrop-blur' : 'bg-navy-700',
        className,
      )}
      data-testid="safebus-brand-mark"
      aria-hidden
    >
      <Bus className={cn('h-5 w-5', iconClassName)} />
    </span>
  );
}
