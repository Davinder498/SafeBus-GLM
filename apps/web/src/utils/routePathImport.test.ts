import { describe, expect, it } from 'vitest';
import { parseRoutePathImport } from './routePathImport';

const curvedPath = {
  type: 'LineString',
  coordinates: [
    [-114.07, 51.04],
    [-114.069, 51.04],
    [-114.069, 51.05],
  ],
};

describe('road-path imports', () => {
  it('retains road bends and coordinate order while stripping feature properties', () => {
    expect(
      parseRoutePathImport(
        JSON.stringify({
          type: 'Feature',
          properties: { private_note: 'discard' },
          geometry: curvedPath,
        }),
      ),
    ).toEqual(curvedPath);
  });
  it('accepts a single-feature collection', () => {
    expect(
      parseRoutePathImport(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: curvedPath }],
        }),
      ),
    ).toEqual(curvedPath);
  });
  it.each([
    'not json',
    JSON.stringify({
      type: 'LineString',
      coordinates: [
        [-114, 51],
        [-114, 51],
      ],
    }),
    JSON.stringify({
      type: 'LineString',
      coordinates: [
        [-114, 91],
        [-115, 51],
      ],
    }),
    JSON.stringify({ type: 'MultiLineString', coordinates: [curvedPath.coordinates] }),
    JSON.stringify({ type: 'FeatureCollection', features: [] }),
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: curvedPath },
        { type: 'Feature', geometry: curvedPath },
      ],
    }),
  ])('rejects ambiguous or invalid imports without substituting straight stop segments', (text) => {
    expect(() => parseRoutePathImport(text)).toThrow();
  });
});
