import { Button } from '@/components/ui/Button';
import { ADMIN_PAGE_SIZES, type AdminPageSize } from '@/types/pagination';

export function AdminPagination({ page, pageSize, totalCount, onPageChange, onPageSizeChange }: {
  page: number; pageSize: AdminPageSize; totalCount: number;
  onPageChange: (page: number) => void; onPageSizeChange: (size: AdminPageSize) => void;
}) {
  const first = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="admin-pagination">
      <p className="text-sm text-gray-600">Showing {first}-{last} of {totalCount}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold text-gray-700" htmlFor="admin-page-size">Rows</label>
        <select id="admin-page-size" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value) as AdminPageSize)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          {ADMIN_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <Button type="button" size="sm" variant="secondary" disabled={last >= totalCount} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
