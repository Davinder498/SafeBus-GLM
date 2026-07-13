export const ADMIN_PAGE_SIZES = [25, 50, 100] as const;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];

export interface PaginatedResult<T> {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: AdminPageSize;
}

export interface AdminListQuery {
  page: number;
  pageSize: AdminPageSize;
  search?: string;
  status?: string | null;
  schoolId?: string | null;
}
