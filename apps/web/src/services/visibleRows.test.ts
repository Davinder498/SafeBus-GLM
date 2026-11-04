import { describe, expect, it } from 'vitest';
import { collectVisibleRows } from './visibleRows';

describe('complete visible record loading', () => {
  it('loads beyond 1000 records with a server cap lower than the requested page', async () => {
    const records = Array.from({ length: 1061 }, (_, index) => ({ id: `row-${index}` }));
    const result = await collectVisibleRows<{ id: string }>(async (from, to) => ({
      data: records.slice(from, Math.min(to + 1, from + 97)), error: null,
    }));
    expect(result).toEqual(records);
  });
  it('fails instead of returning partial records after a request error', async () => {
    await expect(collectVisibleRows(async (from) => from === 0
      ? { data: [{ id: 'one' }], error: null }
      : { data: null, error: { message: 'server detail' } }))
      .rejects.toThrow('Unable to load these records');
  });
  it('fails closed when a page repeats after records change or pagination is ignored', async () => {
    await expect(collectVisibleRows(async () => ({ data: [{ id: 'one' }], error: null })))
      .rejects.toThrow('changed while loading');
  });
});
