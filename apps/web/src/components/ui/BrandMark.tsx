import { cn } from '@/utils/cn';

interface BrandMarkProps {
  className?: string;
  inverse?: boolean;
}

/**
 * Text-only wordmark shared by web and mobile screens.
 * The bus artwork is reserved for the mobile launcher icon.
 */
export function BrandMark({ className, inverse = false }: BrandMarkProps) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 whitespace-nowrap font-extrabold leading-tight tracking-tight',
        inverse ? 'text-white' : 'text-[var(--color-wordmark)]',
        className,
      )}
      data-testid="safebus-wordmark"
    >
      SafeBus
    </span>
  );
}
