type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusPillProps {
  children: string;
  tone?: StatusTone;
  /** Renders a leading status dot (modern indicator style). */
  dot?: boolean;
  /** Gently pulses the status dot for a currently running live service. */
  pulse?: boolean;
}

export function StatusPill({
  children,
  tone = 'neutral',
  dot = false,
  pulse = false,
}: StatusPillProps) {
  return (
    <span
      data-ui="status-pill"
      data-tone={tone}
      data-pulse={pulse || undefined}
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset"
    >
      {dot && <span className="status-pill__dot h-1.5 w-1.5 rounded-full" />}
      {children}
    </span>
  );
}
