export function NotificationTime({ occurredAt }: { occurredAt: string }) {
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime())) return null;
  return (
    <time dateTime={occurredAt} className="text-xs font-normal text-slate-500">
      {new Intl.DateTimeFormat('en-CA', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)}
    </time>
  );
}
