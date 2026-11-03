import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenu({ trigger, children, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initialFocus = useRef<'first' | 'last' | null>(null);

  const menuItems = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const items = menuItems();
    if (initialFocus.current === 'first') items[0]?.focus();
    if (initialFocus.current === 'last') items.at(-1)?.focus();
    initialFocus.current = null;

    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      initialFocus.current = event.key === 'ArrowDown' ? 'first' : 'last';
      setOpen(true);
    }
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = menuItems();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Home') items[0]?.focus();
    else if (event.key === 'End') items.at(-1)?.focus();
    else {
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + delta + items.length) % items.length]?.focus();
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block" data-ui="dropdown">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (!open) initialFocus.current = 'first';
          setOpen((value) => !value);
        }}
        onKeyDown={onTriggerKeyDown}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2"
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          data-ui="dropdown-panel"
          onKeyDown={onPanelKeyDown}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[role="menuitem"]')) closeMenu(true);
          }}
          className={cn(
            'absolute z-50 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-[var(--color-text)] shadow-popover animate-scale-in',
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
      tabIndex={-1}
      data-ui="dropdown-item"
      data-destructive={destructive}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
        destructive
          ? 'text-[var(--color-danger-text)] hover:bg-[var(--color-danger-surface)]'
          : 'text-[var(--color-text)] hover:bg-[var(--color-raised)]',
        'focus:outline-none focus-visible:bg-[var(--color-raised)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-focus)]',
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
  return <div role="separator" className="my-1 h-px bg-[var(--color-border)]" data-ui="dropdown-separator" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      {children}
    </p>
  );
}
