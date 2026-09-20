import { cn } from '@/utils/cn';
import safeBusLogo from '../../../../mobile/assets/brand/safebus-master-mark.png';

interface BrandMarkProps {
  className?: string;
  iconClassName?: string;
}

/**
 * Shared brand tile used by both the web and mobile surfaces.
 */
export function BrandMark({ className, iconClassName }: BrandMarkProps) {
  return (
    <span
      className={cn(
        'safebus-brand-mark flex h-8 w-8 shrink-0 items-center justify-center',
        className,
      )}
      data-testid="safebus-brand-mark"
      aria-hidden
    >
      <img
        src={safeBusLogo}
        alt=""
        className={cn('h-5 w-5 object-contain', iconClassName)}
      />
    </span>
  );
}
