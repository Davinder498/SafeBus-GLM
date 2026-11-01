import { describe, expect, it } from 'vitest';
import { reviewStudentPage, type StudentRosterPreview } from './studentRosterReview';

const student = (overrides: Partial<StudentRosterPreview> = {}): StudentRosterPreview => ({
  id: 'student-1', first_name: 'Avery', last_name: 'Lee', grade: '4',
  school_id: null, status: 'active', bus_assignment_id: 'assignment-1',
  bus_number: '42', route_name: 'North', route_code: 'N1',
  pickup_stop_name: 'Stop A', dropoff_stop_name: 'School',
  ...overrides,
});

describe('read-only current-page roster review', () => {
  it('treats school and grade as optional, not incomplete-transportation issues', () => {
    const result = reviewStudentPage([student({ grade: null, school_id: null })]);
    expect(result.get('student-1')?.kind).toBe('preview-complete');
    expect(result.get('student-1')?.needsReview).toBe(false);
  });

  it('flags missing current bus and missing stop/route previews', () => {
    const rows = [
      student({ id: 'one', bus_assignment_id: null, bus_number: null }),
      student({ id: 'two', pickup_stop_name: null }),
      student({ id: 'three', route_name: null, route_code: null }),
    ];
    const review = reviewStudentPage(rows);
    expect(review.get('one')?.kind).toBe('unassigned');
    expect(review.get('two')?.kind).toBe('partial');
    expect(review.get('three')?.kind).toBe('partial');
  });

  it('marks inactive records as outside active transportation review', () => {
    const row = student({ status: 'inactive', bus_assignment_id: null, bus_number: null });
    expect(reviewStudentPage([row]).get(row.id)?.kind).toBe('inactive');
  });

  it('flags only possible within-page matches without merging or changing records', () => {
    const a = student({ id: 'a', school_id: 'school-1', grade: '4' });
    const b = student({ id: 'b', first_name: ' aVERY ', last_name: 'Lee', school_id: 'school-1', grade: '4' });
    const otherSchool = student({ id: 'c', school_id: 'school-2', grade: '4' });
    const review = reviewStudentPage([a, b, otherSchool]);
    expect(review.get('a')?.kind).toBe('possible-match');
    expect(review.get('b')?.kind).toBe('possible-match');
    expect(review.get('c')?.kind).toBe('preview-complete');
    expect(a.id).toBe('a');
  });

  it('does not claim tenant-wide duplicate detection across unseen pages', () => {
    const a = student({ id: 'a', school_id: null });
    const b = student({ id: 'b', school_id: null });
    expect(reviewStudentPage([a, b]).get('a')?.kind).toBe('preview-complete');
  });
});
