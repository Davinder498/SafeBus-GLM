import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export function DriverActionCard({
  label,
  icon,
  to,
  onClick,
  testId,
  destructive = false,
}: {
  label: string;
  icon: ReactNode;
  to?: string;
  onClick?: () => void;
  testId?: string;
  destructive?: boolean;
}) {
  const props = {
    className: cn(
      'flex min-h-24 w-full min-w-0 items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left shadow-card transition-colors hover:bg-[var(--color-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]',
      destructive ? 'text-danger-700' : 'text-navy-900',
    ),
    'data-testid': testId,
    'data-ui': 'driver-action-card',
  };
  const content = (
    <>
      <span aria-hidden className="shrink-0 rounded-xl bg-navy-50 p-3">
        {icon}
      </span>
      <span className="min-w-0 flex-1 break-words text-base font-bold">{label}</span>
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0" />
    </>
  );
  return to ? (
    <Link to={to} {...props}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} {...props}>
      {content}
    </button>
  );
}
