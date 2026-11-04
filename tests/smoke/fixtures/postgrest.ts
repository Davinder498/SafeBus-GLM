import type { Request } from '@playwright/test';

/** Model table ranges without changing RPC or single-object response shapes. */
export function mockTablePage<T>(request: Request, rows: T[]): T[] {
  const url = new URL(request.url());
  if (request.method() !== 'GET' || url.pathname.includes('/rpc/')) return rows;
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = url.searchParams.get('limit');
  return rows.slice(offset, limit === null ? undefined : offset + Number(limit));
}
