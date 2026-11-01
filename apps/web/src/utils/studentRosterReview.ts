/**
 * Read-only, PAGE-SCOPED district roster triage.
 *
 * The existing paginated RPC returns one currently effective bus assignment
 * preview per student. These hints are NOT a definitive eligibility or
 * whole-district reconciliation, and must never initiate writes.
 */
export interface StudentRosterPreview {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  school_id: string | null;
  status: string;
  bus_assignment_id?: string | null;
  bus_number?: string | null;
  route_name?: string | null;
  route_code?: string | null;
  pickup_stop_name?: string | null;
  dropoff_stop_name?: string | null;
}

export type StudentReviewKind = 'unassigned' | 'partial' | 'possible-match' | 'preview-complete' | 'inactive';

export interface StudentRosterReview {
  kind: StudentReviewKind;
  label: string;
  guidance: string;
  needsReview: boolean;
}

const normalize = (value: string | null | undefined) =>
  (value ?? '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en-CA');

function candidateKey(student: StudentRosterPreview): string | null {
  const first = normalize(student.first_name);
  const last = normalize(student.last_name);
  const grade = normalize(student.grade);
  // Only flag exact name, grade AND school matches. This remains a
  // *possible* match; siblings/namesakes must never be auto-merged.
  if (!first || !last || !grade || !student.school_id) return null;
  return [first, last, grade, student.school_id].join('|');
}

export function reviewStudentPage<T extends StudentRosterPreview>(rows: T[]): Map<string, StudentRosterReview> {
  const countByCandidate = new Map<string, number>();
  for (const row of rows) {
    const key = candidateKey(row);
    if (key) countByCandidate.set(key, (countByCandidate.get(key) ?? 0) + 1);
  }

  return new Map(rows.map((row) => {
    let review: StudentRosterReview;
    if (row.status !== 'active') {
      review = { kind: 'inactive', label: 'Not active', guidance: 'No active-service review is expected for this roster status.', needsReview: false };
    } else if ((candidateKey(row) && (countByCandidate.get(candidateKey(row)!) ?? 0) > 1)) {
      review = { kind: 'possible-match', label: 'Possible match', guidance: 'Name, grade and school match another student on this page. Verify records; no duplicate is confirmed.', needsReview: true };
    } else if (!row.bus_assignment_id || !row.bus_number) {
      review = { kind: 'unassigned', label: 'Bus not assigned', guidance: 'No current bus assignment appears in this roster preview. Check transportation in the student workspace.', needsReview: true };
    } else if (!row.route_name && !row.route_code || !row.pickup_stop_name || !row.dropoff_stop_name) {
      review = { kind: 'partial', label: 'Check trip details', guidance: 'The current bus preview is missing a route or pickup/drop-off stop. Review the student\'s transportation settings.', needsReview: true };
    } else {
      review = { kind: 'preview-complete', label: 'Bus preview complete', guidance: 'This page displays a bus, route and stops. Review the student workspace for all directions and guardian links.', needsReview: false };
    }
    return [row.id, review] as const;
  }));
}
