import { describe, expect, it } from 'vitest';
import { interpolateServiceLinePosition } from './GuardianBusDetailPage';

describe('guardian service-line positioning', () => {
  it('places the bus exactly on first, middle, and final stop anchors', () => {
    const anchors = [14, 103, 247];

    expect(interpolateServiceLinePosition(anchors, 0)?.bus).toBe(14);
    expect(interpolateServiceLinePosition(anchors, 1)?.bus).toBe(103);
    expect(interpolateServiceLinePosition(anchors, 2)?.bus).toBe(247);
  });

  it('interpolates within the real rendered gap instead of equal card percentages', () => {
    const anchors = [12, 72, 252];

    expect(interpolateServiceLinePosition(anchors, 0.5)?.bus).toBe(42);
    expect(interpolateServiceLinePosition(anchors, 1.5)?.bus).toBe(162);
  });

  it('clamps out-of-range projections and rejects unusable input', () => {
    expect(interpolateServiceLinePosition([20, 100], -2)?.bus).toBe(20);
    expect(interpolateServiceLinePosition([20, 100], 4)?.bus).toBe(100);
    expect(interpolateServiceLinePosition([], 0)).toBeNull();
    expect(interpolateServiceLinePosition([20, 100], Number.NaN)).toBeNull();
  });
});
