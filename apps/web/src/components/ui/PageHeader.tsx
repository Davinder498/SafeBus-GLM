import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-yellow-700">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-3xl font-bold tracking-normal text-navy-900 sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-3xl text-base leading-7 text-gray-600">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
