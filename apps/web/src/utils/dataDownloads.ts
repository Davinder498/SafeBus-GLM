import Papa from 'papaparse';

export type DownloadEntity = 'students' | 'guardians' | 'drivers' | 'buses';
export type DownloadRow = Record<string, unknown> & { id: string; tenant_id: string };

const columns: Record<DownloadEntity, Array<[string, string]>> = {
  students: [
    ['First name', 'first_name'],
    ['Last name', 'last_name'],
    ['Preferred name', 'preferred_name'],
    ['Grade', 'grade'],
    ['School', 'school_name'],
    ['Status', 'status'],
    ['Roster bus', 'bus_number'],
    ['Roster route', 'route_code'],
    ['Roster direction', 'trip_type'],
    ['Roster seat', 'seat_number'],
    ['Pickup stop', 'pickup_stop_name'],
    ['Drop-off stop', 'dropoff_stop_name'],
  ],
  guardians: [
    ['First name', 'first_name'],
    ['Last name', 'last_name'],
    ['Name', 'full_name'],
    ['Email', 'email'],
    ['Phone', 'phone'],
    ['Status', 'status'],
    ['Active student links', 'active_link_count'],
  ],
  drivers: [
    ['First name', 'first_name'],
    ['Last name', 'last_name'],
    ['Name', 'full_name'],
    ['Email', 'email'],
    ['Phone', 'phone'],
    ['Employee number', 'employee_number'],
    ['Licence class', 'license_class'],
    ['Licence expiry', 'license_expiry_date'],
    ['Status', 'status'],
  ],
  buses: [
    ['Bus number', 'bus_number'],
    ['Fleet number', 'fleet_number'],
    ['Plate', 'license_plate'],
    ['Capacity', 'capacity'],
    ['School', 'school_name'],
    ['Status', 'status'],
  ],
};

export function recordsCsv(entity: DownloadEntity, rows: DownloadRow[]): string {
  const fields = columns[entity];
  return (
    '\uFEFF' +
    Papa.unparse(
      {
        fields: fields.map(([label]) => label),
        data: rows.map((row) =>
          fields.map(([, key]) => (row[key] == null ? '' : String(row[key]))),
        ),
      },
      {
        quotes: true,
        newline: '\r\n',
        escapeFormulae: /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/,
      },
    ) +
    '\r\n'
  );
}

export function downloadCsv(entity: DownloadEntity, rows: DownloadRow[]): void {
  const url = URL.createObjectURL(
    new Blob([recordsCsv(entity, rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `SafeBus-${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
