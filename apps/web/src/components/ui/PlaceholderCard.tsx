import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from './Card';

interface PlaceholderCardProps {
  title: string;
  description: string;
  /** Optional Lucide icon shown above the title. */
  icon?: ReactNode;
}

export function PlaceholderCard({ title, description, icon }: PlaceholderCardProps) {
  return (
    <Card className="flex min-h-[240px] items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-navy-50 text-navy-500 ring-1 ring-inset ring-navy-100">
          {icon ?? <Sparkles className="h-6 w-6" aria-hidden />}
        </div>
        <p className="mt-4 text-base font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </Card>
  );
}