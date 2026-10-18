import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { UserNotification } from '@safebus/types';
import { cn } from '@/utils/cn';

export function NotificationUpdateCard({
  item,
  onRead,
  onArchive,
}: {
  item: UserNotification;
  onRead: () => void;
  onArchive: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const message = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = message.current;
    if (!element || expanded) return;
    const measure = () => setHasMore(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [item.body, expanded]);
  return (
    <article className="flex items-start gap-3">
      <button
        type="button"
        className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
        onClick={() => {
          if (!item.readAt) onRead();
          if (hasMore) setExpanded((value) => !value);
        }}
        aria-label={`Update: ${item.body}`}
        aria-expanded={hasMore ? expanded : undefined}
      >
        <span className="flex items-start gap-2">
          {!item.readAt && (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              data-ui="notification-unread-dot"
              aria-label="Unread"
            />
          )}
          <span
            ref={message}
            className={cn('text-sm font-bold leading-5 text-navy-900', !expanded && 'line-clamp-3')}
          >
            {item.body}
          </span>
        </span>
        <span className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-[0.6875rem] font-medium text-slate-500">
          <span>{item.readAt ? 'Read' : 'New update'}</span>
          {hasMore &&
            (expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ))}
        </span>
      </button>
      <button
        type="button"
        className="-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        onClick={onArchive}
        aria-label={`Archive ${item.title}`}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </article>
  );
}
