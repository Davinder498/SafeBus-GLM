import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  user: vi.fn(),
  profile: vi.fn(),
  seats: vi.fn(),
}));
vi.mock('@/services/adminPaginationService', () => ({ fetchAdminPage: mocks.page }));
vi.mock('@/lib/supabase', () => ({
  supabaseConfigError: null,
  supabase: {
    auth: { getUser: mocks.user },
    from: () => ({
      select: () => ({
        eq: () => ({ abortSignal: () => ({ single: mocks.profile }) }),
        in: () => ({ abortSignal: mocks.seats }),
      }),
    }),
  },
}));
import { collectDownloadRecords } from './adminDownloadService';
const context = { userId: 'admin', tenantId: 'tenant' };
const row = (i: number) => ({ id: `row-${i}`, tenant_id: 'tenant', first_name: `Student ${i}` });
const options = () => ({ signal: new AbortController().signal });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  mocks.profile.mockResolvedValue({
    data: { id: 'admin', tenant_id: 'tenant', role: 'tenant_admin', status: 'active' },
    error: null,
  });
  mocks.seats.mockResolvedValue({ data: [], error: null });
});
it('collects every filtered page without using the displayed page and rechecks authorization', async () => {
  mocks.page
    .mockResolvedValueOnce({
      page: 1,
      pageSize: 100,
      totalCount: 101,
      rows: Array.from({ length: 100 }, (_, i) => row(i)),
    })
    .mockResolvedValueOnce({ page: 2, pageSize: 100, totalCount: 101, rows: [row(100)] });
  const rows = await collectDownloadRecords(
    'students',
    { search: 'Avery', status: 'active', schoolId: 'school' },
    context,
    options(),
  );
  expect(rows).toHaveLength(101);
  expect(mocks.page).toHaveBeenNthCalledWith(
    2,
    'students',
    expect.objectContaining({
      page: 2,
      pageSize: 100,
      search: 'Avery',
      schoolId: 'school',
      status: 'active',
    }),
    expect.any(AbortSignal),
  );
  expect(mocks.profile).toHaveBeenCalledTimes(2);
});
it.each(['guardians', 'drivers', 'buses'] as const)(
  'supports an empty filtered %s file',
  async (entity) => {
    mocks.page.mockResolvedValue({ page: 1, pageSize: 100, totalCount: 0, rows: [] });
    expect(await collectDownloadRecords(entity, {}, context, options())).toEqual([]);
  },
);
it('fails without partial results when a later page fails', async () => {
  mocks.page
    .mockResolvedValueOnce({
      page: 1,
      pageSize: 100,
      totalCount: 101,
      rows: Array.from({ length: 100 }, (_, i) => row(i)),
    })
    .mockRejectedValueOnce(new Error('Unable to load this list.'));
  await expect(collectDownloadRecords('students', {}, context, options())).rejects.toThrow(
    'Unable to load',
  );
});
it.each([
  { page: 1, pageSize: 100, totalCount: 1, rows: [{ ...row(1), tenant_id: 'other' }] },
  { page: 1, pageSize: 100, totalCount: 2, rows: [row(1), row(1)] },
  { page: 1, pageSize: 100, totalCount: 3, rows: [row(1)] },
  { page: 1, pageSize: 100, totalCount: 100001, rows: [] },
])('rejects unverified or incomplete pages', async (result) => {
  mocks.page.mockResolvedValue(result);
  await expect(collectDownloadRecords('students', {}, context, options())).rejects.toThrow();
});
it('does not download if the tenant role or session changes during collection', async () => {
  mocks.page.mockResolvedValue({ page: 1, pageSize: 100, totalCount: 1, rows: [row(1)] });
  mocks.profile
    .mockResolvedValueOnce({
      data: { tenant_id: 'tenant', role: 'tenant_admin', status: 'active' },
      error: null,
    })
    .mockResolvedValueOnce({
      data: { tenant_id: 'other', role: 'tenant_admin', status: 'active' },
      error: null,
    });
  await expect(collectDownloadRecords('students', {}, context, options())).rejects.toThrow(
    'active school authority administrator',
  );
});
it('enriches only the exact student directory assignment with its seat', async () => {
  mocks.page.mockResolvedValue({
    page: 1,
    pageSize: 100,
    totalCount: 1,
    rows: [{ ...row(1), bus_assignment_id: 'assignment' }],
  });
  mocks.seats.mockResolvedValue({
    data: [{ id: 'assignment', tenant_id: 'tenant', seat_number: 12 }],
    error: null,
  });
  expect((await collectDownloadRecords('students', {}, context, options()))[0].seat_number).toBe(
    12,
  );
});
it('cancels before authorization or data access', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    collectDownloadRecords('students', {}, context, { signal: controller.signal }),
  ).rejects.toThrow();
  expect(mocks.page).not.toHaveBeenCalled();
  expect(mocks.user).not.toHaveBeenCalled();
});
