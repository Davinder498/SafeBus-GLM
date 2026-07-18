import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { Card } from './Card';

interface DataStateProps {
  title: string;
  message: string;
  /** Optional Lucide icon shown in a tinted circle above the title. */
  icon?: ReactNode;
}

export function DataState({ title, message, icon }: DataStateProps) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden />}
      </div>
      <p className="mt-4 text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{message}</p>
    </Card>
  );
}