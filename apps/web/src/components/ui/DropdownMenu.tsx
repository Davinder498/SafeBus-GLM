import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/utils/cn';

interface DropdownMenuProps {
  /** The trigger element (e.g., a button or avatar). */
  trigger: ReactNode;
  children: ReactNode;
  /** Horizontal alignment of the floating panel. */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Minimal, accessible dropdown menu.
 *
 * - Click trigger to toggle, click outside or press Escape to close.
 * - Keyboard: roving focus is intentionally minimal; items are focusable buttons.
 * - `aria-expanded` + `aria-haspopup` wired on the trigger wrapper.
 *
 * No external dependencies — purely presentational + behaviour.
 */
export function DropdownMenu({ trigger, children, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={cn(
            'absolute z-50 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-popover animate-scale-in',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  destructive?: boolean;
  children: ReactNode;
}

export function DropdownItem({
  icon,
  destructive = false,
  className,
  children,
  ...props
}: DropdownItemProps) {
  return (
    <button
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
        destructive
          ? 'text-danger-600 hover:bg-danger-50'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        'focus:outline-none focus-visible:bg-slate-100',
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-slate-100" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</p>;
}