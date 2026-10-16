/** Normalize historical display copy without rewriting stored records or identifiers. */
export function safeBusDisplayText(value: string): string {
  return value.replace(/\bbussafe\b/gi, 'SafeBus');
}
