const PAGE_SIZE = 200;

/** Continue by rows received, even if the server cap is lower than requested. */
export async function collectVisibleRows<T extends { id: string }>(
  page: (from: number, to: number) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let from = 0; from <= 100_000;) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error('Unable to load these records. Please try again.');
    if (!data?.length) return rows;
    for (const item of data as T[]) {
      if (!item.id || seen.has(item.id))
        throw new Error('These records changed while loading. Reload and try again.');
      seen.add(item.id);
      rows.push(item);
    }
    from += data.length;
  }
  throw new Error('Too many records to load together. Narrow your selection.');
}

export async function collectVisibleIds<T extends { id: string }>(
  ids: string[],
  load: (ids: string[]) => Promise<T[]>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let offset = 0; offset < unique.length; offset += 100)
    rows.push(...await load(unique.slice(offset, offset + 100)));
  return rows;
}
