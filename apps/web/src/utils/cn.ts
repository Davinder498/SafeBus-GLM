import { clsx, type ClassValue } from 'clsx';

/**
 * Tailwind-aware className composition helper.
 *
 * Wraps `clsx` so all UI primitives and pages can merge conditional/optional
 * classes in a single, readable call site. Keeping this in one place lets us
 * later swap in `tailwind-merge` without touching every component.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}