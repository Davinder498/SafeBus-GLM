export const MAX_SEAT_NUMBER = 2_147_483_647;

export function parseSeatNumber(value: string, capacity?: number | null): number | null {
  const text = value.trim();
  if (!text) return null;
  const seat = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(seat) || seat < 1 || seat > MAX_SEAT_NUMBER) {
    throw new Error('Enter a positive whole seat number, or leave it blank.');
  }
  if (capacity != null && seat > capacity) {
    throw new Error(`Seat number cannot exceed this bus capacity (${capacity}).`);
  }
  return seat;
}

export function seatLabel(seat?: number | null): string {
  return seat == null ? 'Not assigned' : `Seat ${seat}`;
}

export function studentSeatError(error: { message?: string; code?: string }): Error | null {
  const message = error.message ?? '';
  if (message.includes('student_bus_assignments_seat_overlap')) {
    return new Error(
      'That seat is already assigned for this bus service and overlapping dates. Choose another seat.',
    );
  }
  if (message.includes('Seat number exceeds this bus capacity')) {
    return new Error('Seat number exceeds this bus capacity. Choose a lower seat number.');
  }
  if (message.includes('student_bus_assignments_seat_positive') || error.code === '22003') {
    return new Error('Enter a positive whole seat number, or leave it blank.');
  }
  return null;
}
