import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  CreateRouteShapeVersionInput,
  CurrentRouteShape,
  RouteShapeStatus,
  RouteShapeVersion,
} from '@/types/transportation';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

/**
 * Validate a GeoJSON LineString client-side before calling the RPC. The RPC
 * (validate_route_shape_geojson) re-validates everything server-side; this is
 * just to avoid obviously-bad requests and give the admin a friendly error.
 *
 * GeoJSON coordinates are always [longitude, latitude].
 */
export function validateRouteShapeGeoJson(geojson: unknown): void {
  if (!geojson || typeof geojson !== 'object') {
    throw new Error('Route shape must be valid GeoJSON.');
  }
  const obj = geojson as { type?: unknown; coordinates?: unknown };
  if (obj.type !== 'LineString') {
    throw new Error('Route shape must be a GeoJSON LineString.');
  }
  if (!Array.isArray(obj.coordinates) || obj.coordinates.length < 2) {
    throw new Error('Route shape must contain at least two coordinates.');
  }
  for (const point of obj.coordinates) {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error('Route shape coordinates must be longitude, latitude pairs.');
    }
    const [lng, lat] = point as [unknown, unknown];
    if (
      typeof lng !== 'number' ||
      typeof lat !== 'number' ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < -180 ||
      lng > 180 ||
      lat < -90 ||
      lat > 90
    ) {
      throw new Error(
        'Route shape coordinates must be finite longitude, latitude pairs in valid ranges.',
      );
    }
  }
}

interface AdminRouteShapeVersionRpcRow {
  id: string;
  route_id: string;
  version: number;
  status: string;
  distance_meters: number;
  geojson: unknown;
  effective_from: string | null;
  effective_to: string | null;
  created_at?: string | null;
}

function normalizeStatus(value: string): RouteShapeStatus {
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  return 'draft';
}

function mapVersionRow(row: AdminRouteShapeVersionRpcRow): RouteShapeVersion {
  return {
    id: row.id,
    routeId: row.route_id,
    version: row.version,
    status: normalizeStatus(row.status),
    distanceMeters: row.distance_meters,
    geojson: (row.geojson ?? null) as RouteShapeVersion['geojson'],
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at ?? null,
  };
}

/**
 * List all route shape versions for a route (admin). Calls the
 * get_admin_route_shape_versions RPC (migration 0057). The RPC enforces, via
 * require_route_shape_admin(), that the caller is a tenant/school/
 * transportation admin in the route's tenant.
 */
export async function getAdminRouteShapeVersions(routeId: string): Promise<RouteShapeVersion[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_admin_route_shape_versions', {
    p_route_id: routeId,
  });
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to load route shape versions', error);
    throw new Error(error.message || 'Unable to load route shape versions.');
  }
  return ((data ?? []) as AdminRouteShapeVersionRpcRow[]).map(mapVersionRow);
}

/**
 * Create a new route shape version from admin-authored GeoJSON. Calls the
 * admin_create_route_shape_version RPC (migration 0057). When status is
 * 'published', the RPC archives the previously current published shape.
 */
export async function adminCreateRouteShapeVersion(
  input: CreateRouteShapeVersionInput,
): Promise<RouteShapeVersion> {
  validateRouteShapeGeoJson(input.geojson);
  const client = requireSupabase();
  const { data, error } = await client.rpc('admin_create_route_shape_version', {
    p_route_id: input.routeId,
    p_geojson: input.geojson,
    p_status: input.status ?? 'draft',
    p_source: input.source ?? 'admin_geojson',
  });
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to create route shape version', error);
    throw new Error(error.message || 'Unable to save the route shape.');
  }
  return mapVersionRow(data as AdminRouteShapeVersionRpcRow);
}

/**
 * Publish a route shape version. Calls the admin_publish_route_shape_version
 * RPC (migration 0057). The RPC archives any prior current published shape
 * without deleting history.
 */
export async function adminPublishRouteShapeVersion(
  routeShapeId: string,
): Promise<RouteShapeVersion> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('admin_publish_route_shape_version', {
    p_route_shape_id: routeShapeId,
  });
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to publish route shape version', error);
    throw new Error(error.message || 'Unable to publish the route shape.');
  }
  return mapVersionRow(data as AdminRouteShapeVersionRpcRow);
}

interface CurrentRouteShapeRpcRow extends Omit<AdminRouteShapeVersionRpcRow, 'created_at'> {}

/**
 * Fetch the current published route shape (admin). Calls the
 * get_current_route_shape RPC (migration 0057). Returns null when no published
 * shape exists for the route.
 */
export async function getCurrentRouteShape(routeId: string): Promise<CurrentRouteShape | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_current_route_shape', {
    p_route_id: routeId,
  });
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to load current route shape', error);
    throw new Error(error.message || 'Unable to load the current route shape.');
  }
  const rows = (data ?? []) as CurrentRouteShapeRpcRow[];
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    routeId: row.route_id,
    version: row.version,
    status: normalizeStatus(row.status),
    distanceMeters: row.distance_meters,
    geojson: (row.geojson ?? null) as CurrentRouteShape['geojson'],
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}