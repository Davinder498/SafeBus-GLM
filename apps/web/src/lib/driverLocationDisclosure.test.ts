import { describe, expect, it } from 'vitest';
import {
  DRIVER_LOCATION_DISCLOSURE,
  DRIVER_LOCATION_NOTICE_VERSION,
  needsDriverLocationDisclosure,
} from './driverLocationDisclosure';

describe('driver personal-device location disclosure', () => {
  it('requires the current version and explicitly describes background collection', () => {
    expect(needsDriverLocationDisclosure(null)).toBe(true);
    expect(needsDriverLocationDisclosure('old-version')).toBe(true);
    expect(needsDriverLocationDisclosure(DRIVER_LOCATION_NOTICE_VERSION)).toBe(false);
    expect(DRIVER_LOCATION_DISCLOSURE).toMatch(/location/i);
    expect(DRIVER_LOCATION_DISCLOSURE).toMatch(/app is closed or not in use/i);
    expect(DRIVER_LOCATION_DISCLOSURE).toMatch(/active bus/i);
  });
});
