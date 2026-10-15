import { expect, it, vi } from 'vitest';
import { parseAdminGuardianLinks } from './adminStudentsService';
vi.mock('@/lib/supabase', () => ({ supabase: null, supabaseConfigError: null }));
const link = {
  id: 'link',
  tenant_id: 'tenant',
  student_id: 'student',
  guardian_id: 'guardian',
  relationship: 'mother',
  can_receive_notifications: true,
  status: 'active',
  admin_note: null,
  status_comment: null,
  created_at: '2026-10-14',
  updated_at: '2026-10-14',
};
it('accepts empty and scoped guardian-link results', () => {
  expect(parseAdminGuardianLinks([], 'student', 'tenant')).toEqual([]);
  expect(parseAdminGuardianLinks([link], 'student', 'tenant')).toEqual([link]);
});
it.each([
  null,
  {},
  [null],
  [{ ...link, student_id: 'other' }],
  [{ ...link, tenant_id: 'other' }],
  [{ ...link, guardian_id: null }],
  [{ ...link, can_receive_notifications: 'true' }],
  [{ ...link, relationship: 'unexpected' }],
  [{ ...link, admin_note: {} }],
])('rejects malformed or incorrectly scoped guardian-link payloads', (value) => {
  expect(() => parseAdminGuardianLinks(value, 'student', 'tenant')).toThrow(
    'The linked guardians could not be loaded.',
  );
});
