import { useEffect, useState } from 'react';
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
  useEffect(() => {
    let current = true;
    setResults([]);
    setStatus('');
    if (selected || query.trim().length < 2) return;
    setStatus('Searching authorities…');
    const timer = window.setTimeout(() => {
      void searchAuthorityDirectory(query)
        .then((rows) => {
          if (!current) return;
          setResults(rows);
          setStatus(rows.length ? '' : 'No matching authorities. Enter the details manually.');
        })
        .catch((error: unknown) => {
          if (current)
            setStatus(
              error instanceof Error
                ? error.message
                : 'Search is unavailable. Enter the details manually.',
            );
        });
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  return (
    <div className="space-y-3">
      {selected ? (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="font-semibold text-navy-900">{selected.officialName}</p>
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
              onChange={(event) => setQuery(event.target.value)}
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
