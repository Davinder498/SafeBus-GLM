import clsx from 'clsx';

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusPillProps {
  children: string;
  tone?: StatusTone;
}

const toneClasses: Record<StatusTone, string> = {
  success: 'bg-success-50 text-success-700 ring-success-100',
  warning: 'bg-warning-50 text-warning-700 ring-warning-100',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
  info: 'bg-navy-50 text-navy-700 ring-navy-100',
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
};

export function StatusPill({ children, tone = 'neutral' }: StatusPillProps) {
  return (
    <span
      className={clsx(
        'inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
