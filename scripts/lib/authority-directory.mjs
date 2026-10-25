import { createHash } from 'node:crypto';

export const AUTHORITY_SOURCE_URL = 'https://education.alberta.ca/media/1626668/authority.xlsx';
export const AUTHORITY_LICENCE_URL = 'https://open.alberta.ca/licence';
export const AUTHORITY_ATTRIBUTION =
  'Contains information licensed under the Open Government Licence – Alberta.';
const limits = {
  official_name: 200,
  authority_category: 100,
  address: 600,
  city: 100,
  postal_code: 12,
  email: 320,
  phone: 40,
  website_url: 500,
};
const referenceFields = [
  'authority_code',
  'official_name',
  'authority_category',
  'address',
  'city',
  'province',
  'postal_code',
  'email',
  'phone',
  'website_url',
  'source_url',
  'source_extract_date',
  'available',
];
const headers = [
  'Authority Code',
  'Authority Name',
  'Authority Type',
  'Authority Address1',
  'Authority Address2',
  'Authority City',
  'Authority Province',
  'Authority Postal Code',
  'Authority Telephone',
  'Authority E-Mail',
  'Authority Website',
  'Extract Date',
];
const clean = (value) => (value == null ? null : String(value).trim() || null);
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export function parseAuthorityRows(sheets) {
  if (sheets.length !== 1 || sheets[0].sheet !== 'Authority Information Report')
    throw new Error('Unexpected authority workbook sheets.');
  const rows = sheets[0].data;
  const headerIndex = rows.findIndex((row) => row[0] === 'Authority Code');
  if (headerIndex < 0 || headerIndex > 10) throw new Error('Authority header is missing.');
  const header = rows[headerIndex];
  for (const name of headers)
    if (header.filter((cell) => cell === name).length !== 1)
      throw new Error('Missing or duplicate header: ' + name);
  const records = [],
    warnings = [],
    codes = new Set();
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => cell == null || cell === '')) continue;
    const field = (name) => row[header.indexOf(name)];
    const code = field('Authority Code');
    if (typeof code !== 'string' || !/^[0-9]{4}$/.test(code))
      throw new Error('Authority codes must be four-character text identifiers.');
    if (codes.has(code)) throw new Error('Duplicate authority code: ' + code);
    codes.add(code);
    const rawDate = field('Extract Date');
    const date =
      rawDate instanceof Date
        ? rawDate
        : typeof rawDate === 'number'
          ? new Date(Math.round((rawDate - 25569) * 86400000))
          : null;
    if (!date || Number.isNaN(date.valueOf())) throw new Error('Invalid extract date for ' + code);
    const record = {
      authority_code: code,
      official_name: clean(field('Authority Name')),
      authority_category: clean(field('Authority Type')),
      address:
        [clean(field('Authority Address1')), clean(field('Authority Address2'))]
          .filter(Boolean)
          .join('\n') || null,
      city: clean(field('Authority City')),
      province: clean(field('Authority Province')),
      postal_code: clean(field('Authority Postal Code')),
      email: clean(field('Authority E-Mail')),
      phone: clean(field('Authority Telephone')),
      website_url: clean(field('Authority Website')),
      source_url: AUTHORITY_SOURCE_URL,
      source_extract_date: date.toISOString().slice(0, 10),
      available: true,
    };
    if (
      !record.official_name ||
      !record.authority_category ||
      (record.province !== null && record.province !== 'AB')
    )
      throw new Error('Invalid authority organization fields for ' + code);
    for (const [key, max] of Object.entries(limits))
      if ((record[key]?.length ?? 0) > max) throw new Error('Oversize ' + key + ' for ' + code);
    // These source columns identify organizations; personnel/fax columns are never imported.
    // Do not guess a website protocol or treat multiple email addresses as one recipient.
    for (const [key, valid] of [
      ['email', (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)],
      [
        'website_url',
        (value) => {
          try {
            const u = new URL(value);
            return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
          } catch {
            return false;
          }
        },
      ],
    ])
      if (record[key] && !valid(record[key])) {
        warnings.push({
          authorityCode: code,
          field: key,
          issue: 'Unusable source value omitted; review against the official source.',
        });
        record[key] = null;
      }
    records.push(record);
  }
  if (!records.length || records.length > 5000)
    throw new Error('Unexpected authority record count.');
  if (new Set(records.map((row) => row.source_extract_date)).size !== 1)
    throw new Error('Mixed source extract dates.');
  records.sort((a, b) => a.authority_code.localeCompare(b.authority_code));
  return { records, warnings, extractDate: records[0].source_extract_date };
}

export function compareAuthorityDirectory(records, previous) {
  const before = new Map(previous.map((row) => [row.authority_code, row]));
  const fields = Object.keys(records[0]).filter(
    (key) => !['source_extract_date', 'source_url'].includes(key),
  );
  const fieldChanges = {};
  const added = [],
    changed = [],
    unchanged = [],
    unavailable = [];
  for (const row of records) {
    const old = before.get(row.authority_code);
    if (!old) added.push(row.authority_code);
    else {
      const differences = fields.filter((key) => (old[key] ?? null) !== (row[key] ?? null));
      if (differences.length) {
        changed.push(row.authority_code);
        fieldChanges[row.authority_code] = Object.fromEntries(
          differences.map((key) => [key, { before: old[key] ?? null, after: row[key] ?? null }]),
        );
      } else unchanged.push(row.authority_code);
    }
    before.delete(row.authority_code);
  }
  for (const old of before.values())
    if (old.available !== false) unavailable.push(old.authority_code);
  return { added, changed, unchanged, unavailable, fieldChanges };
}

const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
export function authorityImportSql({ records, sourceSha256, previousSha256 = null }) {
  if (
    !/^[a-f0-9]{64}$/.test(sourceSha256) ||
    (previousSha256 !== null && !/^[a-f0-9]{64}$/.test(previousSha256))
  )
    throw new Error('Invalid import digest.');
  const date = records[0].source_extract_date;
  // Imports own only provincial source fields. Curated search aliases survive refreshes.
  const columns = referenceFields;
  const json =
    '[\n' +
    records
      .map((row) => JSON.stringify(Object.fromEntries(columns.map((key) => [key, row[key]]))))
      .join(',\n') +
    '\n]';
  // Values are SQL literals with apostrophes escaped; no source content is SQL code.
  return `-- Prepared authority directory import. Apply only in the protected reviewed workflow.
-- Source: ${AUTHORITY_SOURCE_URL}
-- ${AUTHORITY_ATTRIBUTION}
-- Source SHA256: ${sourceSha256}; extract date: ${date}; rows: ${records.length}
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('safebus.authority-directory',0));
do $import_guard$ begin
  if (select source_sha256 from safebus_private.authority_directory_import_state where singleton)
      is distinct from ${previousSha256 ? literal(previousSha256) : 'null'} then
    raise exception 'Directory baseline changed. Regenerate and review this import.';
  end if;
end $import_guard$;
create temporary table safebus_authority_import on commit drop as
  select * from jsonb_populate_recordset(null::safebus_private.authority_reference_directory,${literal(json)}::jsonb);
insert into safebus_private.authority_reference_directory(${columns.join(',')},imported_at)
  select ${columns.join(',')},now() from safebus_authority_import
on conflict(authority_code) do update set ${columns
    .filter((k) => k !== 'authority_code')
    .map((k) => `${k}=excluded.${k}`)
    .join(',')},imported_at=now();
update safebus_private.authority_reference_directory d set available=false,imported_at=now()
  where d.available and not exists(select 1 from safebus_authority_import i where i.authority_code=d.authority_code);
insert into safebus_private.authority_directory_import_state(singleton,source_sha256,source_extract_date,record_count)
values(true,${literal(sourceSha256)},${literal(date)},${records.length})
on conflict(singleton) do update set source_sha256=excluded.source_sha256,source_extract_date=excluded.source_extract_date,
  record_count=excluded.record_count,imported_at=now();
`;
}
