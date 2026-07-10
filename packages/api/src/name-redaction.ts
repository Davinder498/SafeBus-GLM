/**
 * SafeBus Alberta — Name redaction.
 *
 * Provides a single minimized display-name rule for views that should avoid
 * showing full student names.
 */

/**
 * Redact a full name to "First L." format.
 *
 * Examples:
 *   "Aman Smith"   → "Aman S."
 *   "Aman"         → "Aman"
 *   "A B"          → "A B"
 *   ""             → ""
 *   null/undefined → ""
 */
export function redactName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const lastInitial = parts[parts.length - 1]![0]!;
  return `${first} ${lastInitial.toUpperCase()}.`;
}

/**
 * Get initials for avatar display (max 2 characters).
 * "Aman Smith" → "AS", "Aman" → "A"
 */
export function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
