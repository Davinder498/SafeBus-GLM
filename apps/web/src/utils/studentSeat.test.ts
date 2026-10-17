import { describe, expect, it } from 'vitest';
import { MAX_SEAT_NUMBER, parseSeatNumber, seatLabel, studentSeatError } from './studentSeat';

describe('optional seat numbers', () => {
  it('accepts blank, positive whole numbers, and the integer boundary with unknown capacity', () => {
    expect(parseSeatNumber('   ')).toBeNull();
    expect(parseSeatNumber('12', 12)).toBe(12);
    expect(parseSeatNumber(String(MAX_SEAT_NUMBER), null)).toBe(MAX_SEAT_NUMBER);
    expect(seatLabel(null)).toBe('Not assigned');
    expect(seatLabel(12)).toBe('Seat 12');
  });
  it.each(['0', '-1', '1.5', '12A', '1e2', '+2', '2147483648'])(
    'rejects invalid seat %s',
    (value) => {
      expect(() => parseSeatNumber(value)).toThrow('positive whole seat number');
    },
  );
  it('validates known capacity, including zero', () => {
    expect(() => parseSeatNumber('21', 20)).toThrow('capacity (20)');
    expect(() => parseSeatNumber('1', 0)).toThrow('capacity (0)');
    expect(parseSeatNumber('', 0)).toBeNull();
  });
  it('distinguishes seat conflicts from unrelated assignment conflicts', () => {
    expect(
      studentSeatError({ code: '23P01', message: 'student_bus_assignments_seat_overlap' })?.message,
    ).toContain('seat is already assigned');
    expect(studentSeatError({ code: '23P01', message: 'existing student service' })).toBeNull();
    expect(
      studentSeatError({ code: '23514', message: 'Seat number exceeds this bus capacity.' })
        ?.message,
    ).toContain('capacity');
  });
});
