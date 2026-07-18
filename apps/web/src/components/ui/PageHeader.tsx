import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Optional Lucide icon shown in a tinted tile beside the title. */
  icon?: ReactNode;
  /** Optional small label rendered above the title instead of `eyebrow`. */
  badge?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, icon, badge, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        {icon && (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-100">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {(eyebrow || badge) && (
            <div className="mb-1.5">
              {badge ?? (
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-navy-600">
                  {eyebrow}
                </p>
              )}
            </div>
          )}
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className={cn('mt-2 max-w-3xl text-sm leading-6 text-slate-500')}>{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}