import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { MoreVertical, RefreshCw } from 'lucide-react';
import { DropdownMenu, DropdownItem } from '@/components/ui/DropdownMenu';

export function GuardianRefreshMenu({
  refreshing,
  refresh,
}: {
  refreshing: boolean;
  refresh: () => void;
}) {
  return (
    <DropdownMenu
      triggerLabel="Page options"
      className="guardian-refresh-menu"
      trigger={
        <span className="inline-flex h-12 w-12 rounded-full items-center justify-center text-[var(--color-text)]">
          <MoreVertical aria-hidden className="h-6 w-6" />
        </span>
      }
    >
      <DropdownItem
        className="min-h-12"
        icon={<RefreshCw aria-hidden className="h-5 w-5" />}
        disabled={refreshing}
        onClick={refresh}
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </DropdownItem>
    </DropdownMenu>
  );
}

/** Only a deliberate downward drag from the top of a non-interactive area refreshes. */
export function GuardianRefresh({
  enabled,
  refreshing,
  refresh,
  children,
}: {
  enabled: boolean;
  refreshing: boolean;
  refresh: () => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const distance = useRef(0);
  const [pull, setPull] = useState(0);
  function reset() {
    start.current = null;
    distance.current = 0;
    setPull(0);
  }
  function onStart(event: TouchEvent<HTMLDivElement>) {
    reset();
    if (!enabled || refreshing || event.touches.length !== 1 || window.scrollY > 0) return;
    if (
      (event.target as HTMLElement).closest('a, button, input, select, textarea, [role="button"]')
    )
      return;
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
  }
  function onMove(event: TouchEvent<HTMLDivElement>) {
    if (!start.current) return;
    if (event.touches.length !== 1 || refreshing || window.scrollY > 0) {
      reset();
      return;
    }
    const touch = event.touches[0];
    const dy = touch.clientY - start.current.y;
    if (dy < 0 || Math.abs(touch.clientX - start.current.x) > 35) {
      reset();
      return;
    }
    distance.current = Math.min(dy, 120);
    setPull(distance.current);
  }
  return (
    <div
      className="mx-auto max-w-3xl space-y-5"
      data-ui={enabled ? 'guardian-refresh-surface' : undefined}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchCancel={reset}
      onTouchEnd={() => {
        const trigger = distance.current >= 80 && !refreshing;
        reset();
        if (trigger) refresh();
      }}
    >
      {enabled && (
        <div
          role="status"
          aria-live="polite"
          className={
            refreshing || pull > 20
              ? 'flex min-h-10 items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]'
              : 'sr-only'
          }
        >
          {(refreshing || pull > 20) && <RefreshCw aria-hidden className="h-5 w-5" />}
          {refreshing
            ? 'Refreshing…'
            : pull >= 80
              ? 'Release to refresh'
              : pull > 20
                ? 'Pull down to refresh'
                : ''}
        </div>
      )}
      {children}
    </div>
  );
}

export function GuardianLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
    >
      <div aria-hidden="true" className="space-y-4">
        <div className="h-6 w-1/2 rounded bg-[var(--color-border)]" />
        <div className="h-4 w-3/4 rounded bg-[var(--color-border)]" />
        <div className="h-4 w-2/3 rounded bg-[var(--color-border)]" />
      </div>
      <p className="mt-5 text-sm text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
