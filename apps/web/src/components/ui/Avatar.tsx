import { cn } from '@/utils/cn';

interface AvatarProps {
  /** Full name used to derive initials when no image is provided. */
  name?: string;
  /** Optional image URL. If absent, initials are shown. */
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
};

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-navy-100 font-semibold text-navy-700 ring-1 ring-inset ring-navy-200',
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name ? `${name}'s avatar` : 'Avatar'} className="h-full w-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}