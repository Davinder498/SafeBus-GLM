import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc }, supabaseConfigError: null }));
import { adminCreateRouteShapeVersion, adminPublishRouteShapeVersion } from './routeShapeService';

const geojson = {
  type: 'LineString' as const,
  coordinates: [
    [-114, 51],
    [-114.01, 51.01],
  ] as [number, number][],
};
const row = {
  id: 'shape-id',
  route_id: 'route-id',
  version: 2,
  status: 'draft',
  distance_meters: 1200,
  geojson,
  effective_from: null,
  effective_to: null,
};
describe('road-path write RPC contracts', () => {
  beforeEach(() => rpc.mockReset());
  it('maps the RETURNS TABLE draft response and explicitly saves a draft', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect(
      adminCreateRouteShapeVersion({ routeId: 'route-id', geojson }),
    ).resolves.toMatchObject({ id: 'shape-id', routeId: 'route-id', status: 'draft', geojson });
    expect(rpc).toHaveBeenCalledWith('admin_create_route_shape_version', {
      p_route_id: 'route-id',
      p_geojson: geojson,
      p_status: 'draft',
      p_source: 'admin_geojson',
    });
  });
  it('publishes only a saved version ID', async () => {
    rpc.mockResolvedValue({ data: [{ ...row, status: 'published' }], error: null });
    await expect(adminPublishRouteShapeVersion('shape-id')).resolves.toMatchObject({
      id: 'shape-id',
      status: 'published',
    });
    expect(rpc).toHaveBeenCalledWith('admin_publish_route_shape_version', {
      p_route_shape_id: 'shape-id',
    });
  });
  it('rejects empty successful responses instead of reporting an undefined version', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(adminPublishRouteShapeVersion('shape-id')).rejects.toThrow('Reload its versions');
  });
  it('propagates rejected writes and never publishes after a draft failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Route not found.' } });
    await expect(adminCreateRouteShapeVersion({ routeId: 'route-id', geojson })).rejects.toThrow(
      'Route not found.',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
