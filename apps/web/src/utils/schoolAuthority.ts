/** Display labels for existing account types; persisted values stay compatible. */
export const schoolAuthorityAccountTypes = [
  { value: 'school_group', label: 'School division / district' },
  { value: 'school', label: 'Other school authority' },
  { value: 'demo', label: 'Demo school authority' },
] as const;

export function schoolAuthorityTypeLabel(value: string): string {
  if (value === 'school') return 'School authority';
  if (value === 'bus_contractor') return 'Legacy bus contractor account';
  return (
    schoolAuthorityAccountTypes.find((type) => type.value === value)?.label ?? 'School authority'
  );
}
