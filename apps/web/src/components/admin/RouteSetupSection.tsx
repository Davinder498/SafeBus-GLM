import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
export function RouteSetupSection({
  id,
  title,
  children,
  testId,
}: {
  id: string;
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <details
      id={id}
      open
      data-testid={testId}
      className="group/step scroll-mt-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl p-5 focus-visible:ring-2 focus-visible:ring-navy-500 [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg font-bold text-navy-900">{title}</h2>
        <ChevronDown
          aria-hidden
          className="h-5 w-5 shrink-0 text-navy-700 transition-transform group-open/step:rotate-180"
        />
      </summary>
      <div className="space-y-4 px-5 pb-5">{children}</div>
    </details>
  );
}
