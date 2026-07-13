import { useEffect, useRef, useState } from 'react';
import { searchAdminStudents, type StudentSearchOption } from '@/services/adminPaginationService';

export function StudentSearchPicker({ value, onChange, initialLabel }: { value: string; onChange: (id: string, option?: StudentSearchOption) => void; initialLabel?: string }) {
  const [query, setQuery] = useState(initialLabel ?? '');
  const [options, setOptions] = useState<StudentSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    if (value && query === initialLabel) return;
    const timer = window.setTimeout(() => {
      const request = ++sequence.current;
      setLoading(true);
      void searchAdminStudents(query).then((rows) => { if (request === sequence.current) setOptions(rows); }).finally(() => { if (request === sequence.current) setLoading(false); });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [initialLabel, query, value]);
  return (
    <div>
      <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); onChange(''); }} placeholder="Type at least 2 characters" className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3" aria-label="Search students" />
      {loading && <p className="mt-1 text-xs text-gray-500">Searching...</p>}
      {options.length > 0 && !value && <ul className="mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">{options.map((option) => <li key={option.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { setQuery(option.label); setOptions([]); onChange(option.id, option); }}>{option.label}{option.school_name ? ` - ${option.school_name}` : ''}</button></li>)}</ul>}
    </div>
  );
}
