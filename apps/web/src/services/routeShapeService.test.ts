import { describe, expect, it } from 'vitest';
import { validateRouteShapeGeoJson } from '@/services/routeShapeService';

describe('validateRouteShapeGeoJson', () => {
  it('accepts a valid LineString in longitude, latitude order', () => {
    expect(() =>
      validateRouteShapeGeoJson({
        type: 'LineString',
        coordinates: [
          [-114.07, 51.04],
          [-114.06, 51.05],
        ],
      }),
    ).not.toThrow();
  });

  it('rejects a Polygon', () => {
    expect(() =>
      validateRouteShapeGeoJson({ type: 'Polygon', coordinates: [] }),
    ).toThrowError(/LineString/);
  });

  it('rejects fewer than two coordinates', () => {
    expect(() =>
      validateRouteShapeGeoJson({ type: 'LineString', coordinates: [[-114.07, 51.04]] }),
    ).toThrowError(/at least two/);
  });

  it('rejects coordinates outside valid ranges', () => {
    expect(() =>
      validateRouteShapeGeoJson({
        type: 'LineString',
        coordinates: [
          [-114.07, 51.04],
          [-114.07, 91], // latitude out of range
        ],
      }),
    ).toThrowError(/valid ranges/);
  });

  it('rejects non-numeric coordinates', () => {
    expect(() =>
      validateRouteShapeGeoJson({
        type: 'LineString',
        coordinates: [
          [-114.07, 51.04],
          ['not a number', 51.05],
        ],
      }),
    ).toThrowError(/finite/);
  });

  it('rejects non-object input', () => {
    expect(() => validateRouteShapeGeoJson(null)).toThrowError(/GeoJSON/);
    expect(() => validateRouteShapeGeoJson('LineString')).toThrowError(/GeoJSON/);
  });

  it('rejects coordinates that are not pairs', () => {
    expect(() =>
      validateRouteShapeGeoJson({
        type: 'LineString',
        coordinates: [
          [-114.07],
          [-114.06, 51.05],
        ],
      }),
    ).toThrowError(/longitude, latitude pairs/);
  });
});