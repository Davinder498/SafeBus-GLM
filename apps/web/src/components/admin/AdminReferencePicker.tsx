import { useEffect, useId, useState } from 'react';
import { fetchAdminPage } from '@/services/adminPaginationService';

type ReferenceRow = { id: string; bus_number?: string; full_name?: string;
  first_name?: string | null; last_name?: string | null; employee_number?: string | null };

export function AdminReferencePicker({ entity, value, selectedLabel, onChange }: {
  entity: 'buses' | 'drivers'; value: string; selectedLabel?: string;
  onChange(id: string): void;
}) {
  const id = useId();
  const label = entity === 'buses' ? 'Bus' : 'Driver';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ rows: ReferenceRow[]; totalCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setResult(null);
    setError(null);
    const timer = window.setTimeout(() => {
      void fetchAdminPage<ReferenceRow>(entity, { page, pageSize: 25, search, status: 'active' }, controller.signal)
        .then((next) => { if (!controller.signal.aborted) setResult(next); })
        .catch(() => { if (!controller.signal.aborted) setError(`Unable to search ${entity}. Close and reopen to retry.`); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [entity, open, page, search]);
  const rowLabel = (row: ReferenceRow) => entity === 'buses' ? `Bus ${row.bus_number ?? ''}` :
    `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.full_name || row.employee_number || 'Driver';
  return (
    <div className="space-y-2">
      <span id={`${id}-label`} className="text-sm font-semibold">{label}</span>
      <button type="button" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open}
        aria-controls={`${id}-choices`} onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center rounded-lg border border-navy-200 bg-white px-3 py-2 text-left text-sm">
        <span id={`${id}-value`}>{chosen?.id === value ? chosen.label : selectedLabel || (value ? `${label} selected` : `Choose ${label.toLowerCase()}`)}</span>
      </button>
      {open && <div id={`${id}-choices`} className="space-y-3 rounded-lg border border-navy-200 bg-white p-3">
        <label className="block text-sm font-semibold" htmlFor={`${id}-search`}>Search {entity}</label>
        <input id={`${id}-search`} type="search" value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          className="min-h-11 w-full rounded-lg border border-navy-200 px-3 text-sm" />
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        {!error && !result && <p role="status" className="text-sm">Loading {entity}…</p>}
        {result && <>
          <ul className="max-h-64 overflow-y-auto">
            {result.rows.map((row) => <li key={row.id}><button type="button" aria-pressed={value === row.id}
              className="min-h-11 w-full rounded px-3 py-2 text-left text-sm hover:bg-navy-50"
              onClick={() => { const name = rowLabel(row); setChosen({ id: row.id, label: name }); onChange(row.id); setOpen(false); }}>
              {rowLabel(row)}
            </button></li>)}
          </ul>
          {result.rows.length === 0 && <p role="status" className="text-sm">No matching {entity}.</p>}
          <div className="flex items-center justify-between gap-2 text-sm">
            <button type="button" disabled={page === 1} className="min-h-11 px-2 disabled:opacity-40" onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span>Page {page} of {Math.max(1, Math.ceil(result.totalCount / 25))}</span>
            <button type="button" disabled={page * 25 >= result.totalCount} className="min-h-11 px-2 disabled:opacity-40" onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </>}
      </div>}
    </div>
  );
}
