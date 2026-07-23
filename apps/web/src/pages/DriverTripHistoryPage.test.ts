import { describe, expect, it } from 'vitest';
import { formatDuration } from '@/pages/DriverTripHistoryPage';

describe('driver trip history duration', () => {
  it('formats completed daily run durations', () => {
    expect(formatDuration('2026-07-21T14:00:00.000Z', '2026-07-21T15:05:00.000Z')).toBe(
      '1 hr 5 min',
    );
  });

  it('never displays a negative duration', () => {
    expect(formatDuration('2026-07-21T15:05:00.000Z', '2026-07-21T14:00:00.000Z')).toBe('0 min');
  });
});
