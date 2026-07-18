import { cn } from '@/utils/cn';

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusPillProps {
  children: string;
  tone?: StatusTone;
  /** Renders a leading status dot (modern indicator style). */
  dot?: boolean;
}

const toneClasses: Record<StatusTone, string> = {
  success: 'bg-success-50 text-success-700 ring-success-200',
  warning: 'bg-warning-50 text-warning-700 ring-warning-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  info: 'bg-navy-50 text-navy-700 ring-navy-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const dotToneClasses: Record<StatusTone, string> = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-navy-500',
  neutral: 'bg-slate-400',
};

export function StatusPill({ children, tone = 'neutral', dot = false }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        toneClasses[tone],
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotToneClasses[tone])} />}
      {children}
    </span>
  );
}