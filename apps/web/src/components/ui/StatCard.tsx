import type { ReactNode } from 'react';
import { Card } from './Card';
import { cn } from '@/utils/cn';

type StatTone = 'neutral' | 'navy' | 'success' | 'warning' | 'danger';

interface StatCardProps {
  label: string;
  value: string | number;
  detail: string;
  /** Optional Lucide icon rendered in a tinted square. */
  icon?: ReactNode;
  /** Tints the value + icon. Defaults to neutral. */
  tone?: StatTone;
}

const valueToneClasses: Record<StatTone, string> = {
  neutral: 'text-slate-900',
  navy: 'text-navy-700',
  success: 'text-success-600',
  warning: 'text-warning-600',
  danger: 'text-danger-600',
};

const iconToneClasses: Record<StatTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  navy: 'bg-navy-50 text-navy-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
};

export function StatCard({ label, value, detail, icon, tone = 'neutral' }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className={cn('mt-2 text-3xl font-bold tracking-tight', valueToneClasses[tone])}>
            {value}
          </p>
          <p className="mt-1 text-sm text-slate-500">{detail}</p>
        </div>
        {icon && (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              iconToneClasses[tone],
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}