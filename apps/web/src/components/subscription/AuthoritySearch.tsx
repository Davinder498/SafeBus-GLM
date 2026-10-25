import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  searchAuthorityDirectory,
  type AuthorityReference,
} from '@/services/authorityDirectoryService';

export function AuthoritySearch({
  selected,
  onSelect,
}: {
  selected: AuthorityReference | null;
  onSelect(value: AuthorityReference | null): void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AuthorityReference[]>([]);
  const [status, setStatus] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef<object>({});
  useEffect(() => {
    const request = {};
    generation.current = request;
    setResults([]);
    setStatus('');
    setTotal(null);
    setNextOffset(null);
    setLoading(false);
    if (selected || query.trim().length < 2) return;
    setStatus('Searching authorities…');
    const timer = window.setTimeout(() => {
      setLoading(true);
      void searchAuthorityDirectory(query)
        .then((page) => {
          if (request !== generation.current) return;
          setResults(page.items);
          setTotal(page.total);
          setNextOffset(page.nextOffset);
          setStatus(
            page.items.length ? '' : 'No matching authorities. Enter the details manually.',
          );
        })
        .catch((error: unknown) => {
          if (request === generation.current)
            setStatus(
              error instanceof Error
                ? error.message
                : 'Search is unavailable. Enter the details manually.',
            );
        })
        .finally(() => {
          if (request === generation.current) setLoading(false);
        });
    }, 300);
    return () => {
      generation.current = {};
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  async function loadMore() {
    if (nextOffset === null || loading) return;
    const request = generation.current;
    setLoading(true);
    setStatus('');
    try {
      const page = await searchAuthorityDirectory(query, nextOffset);
      if (request !== generation.current) return;
      setResults((rows) => [
        ...new Map([...rows, ...page.items].map((row) => [row.authorityCode, row])).values(),
      ]);
      setTotal(page.total);
      setNextOffset(page.nextOffset);
    } catch {
      if (request === generation.current)
        setStatus('More results could not be loaded. Try Load more again.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {selected ? (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="font-semibold text-navy-900">{selected.officialName}</p>
          {selected.aliases?.length ? (
            <p className="text-sm text-slate-700">{selected.aliases.join(' · ')}</p>
          ) : null}
          <p className="text-sm text-slate-600">
            {selected.authorityCode} · {selected.authorityCategory}
            {selected.city ? ` · ${selected.city}` : ''}
          </p>
          <p className="mt-2 text-xs text-slate-500">Source date: {selected.sourceExtractDate}</p>
          <Button
            type="button"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              setQuery('');
              onSelect(null);
            }}
          >
            Use manual entry
          </Button>
        </div>
      ) : (
        <>
          <Field label="Search Alberta school authorities" htmlFor="authority-search">
            <Input
              id="authority-search"
              type="search"
              maxLength={100}
              value={query}
              placeholder="Name, authority code, or city"
              onChange={(event) => {
                generation.current = {};
                setQuery(event.target.value);
              }}
            />
          </Field>
          {status && (
            <p role="status" className="text-sm text-slate-600">
              {status}
            </p>
          )}
          {results.length > 0 && (
            <ul
              aria-label="Matching school authorities"
              className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200"
            >
              {results.map((row) => (
                <li key={row.authorityCode}>
                  <button
                    type="button"
                    disabled={row.alreadyLinked}
                    className="w-full p-3 text-left text-sm hover:bg-slate-50 focus-visible:outline-navy-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    onClick={() => onSelect(row)}
                  >
                    <span className="block font-semibold">{row.officialName}</span>
                    {row.aliases?.length ? (
                      <span className="block text-slate-700">{row.aliases.join(' · ')}</span>
                    ) : null}
                    <span>
                      {row.authorityCode} · {row.authorityCategory}
                      {row.city ? ` · ${row.city}` : ''}
                    </span>
                    {row.alreadyLinked && (
                      <span className="block">Already has a SafeBus account</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {total !== null && total > 0 && (
            <p role="status" className="text-sm text-slate-600">
              Showing {results.length} of {total} matching school authorities
            </p>
          )}
          {nextOffset !== null && (
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => void loadMore()}
            >
              {loading ? 'Loading more…' : 'Load more'}
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-slate-500">
        Contains information licensed under the{' '}
        <a
          href="https://open.alberta.ca/licence"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Open Government Licence – Alberta
        </a>
        .
      </p>
    </div>
  );
}
