import { validateRouteShapeGeoJson } from '@/services/routeShapeService';
import type { RouteShapeGeoJson } from '@/types/transportation';

export const MAX_ROUTE_PATH_FILE_BYTES = 2 * 1024 * 1024;

/** Import geometry only; feature properties are never persisted. */
export function parseRoutePathImport(text: string): RouteShapeGeoJson {
  if (new TextEncoder().encode(text).length > MAX_ROUTE_PATH_FILE_BYTES) {
    throw new Error('Choose a GeoJSON file smaller than 2 MB.');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('The file must contain valid GeoJSON JSON.');
  }
  if (value && typeof value === 'object') {
    const object = value as { type?: string; geometry?: unknown; features?: unknown[] };
    if (object.type === 'Feature') value = object.geometry;
    else if (object.type === 'FeatureCollection') {
      if (!Array.isArray(object.features) || object.features.length !== 1) {
        throw new Error('Import one LineString path at a time.');
      }
      const feature = object.features[0] as { type?: string; geometry?: unknown } | null;
      if (feature?.type !== 'Feature') throw new Error('Import one LineString feature.');
      value = feature.geometry;
    }
  }
  validateRouteShapeGeoJson(value);
  const shape = value as RouteShapeGeoJson;
  return { type: 'LineString', coordinates: shape.coordinates.map(([lng, lat]) => [lng, lat]) };
}
