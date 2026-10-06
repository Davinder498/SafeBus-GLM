import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { MapTileConfig } from '@/config/mapTiles';
import {
  adminCreateRouteShapeVersion,
  adminPublishRouteShapeVersion,
  getAdminRouteShapeVersions,
  validateRouteShapeGeoJson,
} from '@/services/routeShapeService';
import type {
  Route,
  RouteShapeGeoJson,
  RouteShapeVersion,
  RouteStop,
} from '@/types/transportation';
import { MAX_ROUTE_PATH_FILE_BYTES, parseRoutePathImport } from '@/utils/routePathImport';
import { RoutePathMap } from './RoutePathMap';

type Points = RouteShapeGeoJson['coordinates'];

export function RoutePathEditor({
  route,
  stops,
  tileConfig,
  onPublishedStateChange,
}: {
  route: Route;
  stops: RouteStop[];
  tileConfig: MapTileConfig;
  onPublishedStateChange?: (published: boolean | null) => void;
}) {
  const id = useId();
  const [versions, setVersions] = useState<RouteShapeVersion[]>([]);
  const [selected, setSelected] = useState<RouteShapeVersion | null>(null);
  const [points, setPoints] = useState<Points>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [source, setSource] = useState<'admin_geojson' | 'import'>('admin_geojson');
  const [fitRequest, setFitRequest] = useState(0);
  const [tileFailed, setTileFailed] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [importText, setImportText] = useState('');
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');

  useEffect(() => {
    onPublishedStateChange?.(
      loading || loadError
        ? null
        : versions.some((v) => v.status === 'published' && !v.effectiveTo),
    );
  }, [loading, loadError, versions, onPublishedStateChange]);

  useEffect(() => {
    if (window.location.hash === '#road-path')
      document.getElementById('road-path')?.scrollIntoView();
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    void getAdminRouteShapeVersions(route.id)
      .then((rows) => {
        if (!mounted) return;
        const sorted = [...rows].sort((a, b) => b.version - a.version);
        const initial =
          sorted.find((row) => row.status === 'published' && !row.effectiveTo) ?? sorted[0] ?? null;
        setVersions(sorted);
        setSelected(initial);
        setPoints(initial?.geojson?.coordinates ?? []);
        setReviewed(false);
        setFitRequest((value) => value + 1);
      })
      .catch(() => {
        if (mounted)
          setLoadError('We could not load the saved road paths. Reload before making changes.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [route.id, reload]);

  const validation = useMemo(() => {
    try {
      validateRouteShapeGeoJson({ type: 'LineString', coordinates: points });
      return null;
    } catch (failure) {
      return failure instanceof Error ? failure.message : 'Check the route path.';
    }
  }, [points]);
  const unsaved = JSON.stringify(points) !== JSON.stringify(selected?.geojson?.coordinates ?? []);
  const mapAvailable = tileConfig.isConfigured && !tileFailed;
  const current = versions.find(
    (version) => version.status === 'published' && !version.effectiveTo,
  );
  const canPublish =
    selected?.status === 'draft' && !unsaved && !validation && reviewed && mapAvailable && !busy;

  function changePoints(next: Points) {
    if (busy) return;
    if (next.length > 10000) {
      setError('Route shape cannot contain more than 10,000 points.');
      return;
    }
    setPoints(next);
    setReviewed(false);
    setError(null);
    setMessage(null);
  }
  function selectVersion(value: string) {
    if (unsaved && !window.confirm('Discard your unsaved road-path edits?')) return;
    const version = versions.find((item) => item.id === value) ?? null;
    setSelected(version);
    setPoints(version?.geojson?.coordinates ?? []);
    setReviewed(false);
    setDrawing(false);
    setError(null);
    setMessage(null);
    setFitRequest((value) => value + 1);
  }
  function importPath(text: string) {
    try {
      const shape = parseRoutePathImport(text);
      changePoints(shape.coordinates);
      setSource('import');
      setDrawing(false);
      setFitRequest((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to import this path.');
    }
  }
  async function saveDraft() {
    if (busy || validation) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const version = await adminCreateRouteShapeVersion({
        routeId: route.id,
        geojson: { type: 'LineString', coordinates: points },
        status: 'draft',
        source,
      });
      setVersions((rows) => [version, ...rows]);
      setSelected(version);
      setPoints(version.geojson?.coordinates ?? points);
      setReviewed(false);
      setDrawing(false);
      setMessage(`Draft version ${version.version} saved. Review the path before publishing.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the draft.');
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!canPublish || !selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const version = await adminPublishRouteShapeVersion(selected.id);
      setVersions((rows) =>
        rows.map((row) =>
          row.id === version.id
            ? version
            : row.status === 'published'
              ? { ...row, status: 'archived', effectiveTo: version.effectiveFrom }
              : row,
        ),
      );
      setSelected(version);
      setReviewed(false);
      setConfirmPublish(false);
      setMessage(
        `Road path version ${version.version} published. It will be used by new bus runs; runs already in progress keep their original path.`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to publish the road path.');
      setConfirmPublish(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="scroll-mt-24 space-y-5 p-5" id="road-path" data-testid="route-path-editor">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Road path</h2>
        <p className="mt-1 text-sm text-gray-600">
          Trace the roads the bus actually follows, including turns and curves. Numbered markers are
          the saved stops. Points are joined directly. Add a point at every road bend; drawing does
          not automatically snap to roads.
        </p>
        <p className="mt-2 text-sm font-semibold text-navy-800">
          {current
            ? `Published path: version ${current.version} · ${(current.distanceMeters / 1000).toFixed(2)} km`
            : 'No published road path. Live service-line progress currently uses straight segments between stops.'}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Draw from the first outbound stop to the last. This route shares one road path for
          outbound and return runs. If they use different roads, configure separate routes.
        </p>
      </div>
      {loading ? (
        <p role="status">Loading saved paths…</p>
      ) : loadError ? (
        <div role="alert">
          <p>{loadError}</p>
          <Button className="mt-3" onClick={() => setReload((value) => value + 1)}>
            Reload paths
          </Button>
        </div>
      ) : (
        <>
          <label className="block text-sm font-semibold text-gray-700" htmlFor={`${id}-version`}>
            Saved path versions
          </label>
          <select
            id={`${id}-version`}
            className="w-full rounded-lg border border-gray-300 p-3"
            value={selected?.id ?? ''}
            disabled={busy}
            onChange={(event) => selectVersion(event.target.value)}
          >
            <option value="">New path</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                Version {version.version} · {version.status} ·{' '}
                {(version.distanceMeters / 1000).toFixed(2)} km
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!unsaved || window.confirm('Discard unsaved edits and reload saved paths?'))
                setReload((value) => value + 1);
            }}
          >
            Reload saved paths
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={drawing ? 'primary' : 'outline'}
              disabled={busy || !mapAvailable}
              aria-pressed={drawing}
              onClick={() => {
                setDrawing((value) => !value);
                setReviewed(false);
              }}
            >
              {drawing ? 'Finish drawing' : 'Draw on map'}
            </Button>
            <Button
              variant="outline"
              disabled={busy || points.length === 0}
              onClick={() => changePoints(points.slice(0, -1))}
            >
              Undo last point
            </Button>
            <Button
              variant="outline"
              disabled={busy || points.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    'Clear the unsaved path from the editor? Saved versions will remain.',
                  )
                )
                  changePoints([]);
              }}
            >
              Clear path
            </Button>
            <Button
              variant="outline"
              disabled={!mapAvailable}
              onClick={() => setFitRequest((value) => value + 1)}
            >
              Fit path and stops
            </Button>
          </div>
          <p className="text-sm text-gray-600">
            {drawing
              ? 'Click along the road to add points. Drag a blue point to adjust it. Finish drawing before review.'
              : 'Drag blue points to adjust the path, or import a road path below.'}{' '}
            {points.length.toLocaleString()} path points.
          </p>
          {mapAvailable ? (
            <RoutePathMap
              key={mapAttempt}
              route={route}
              stops={stops}
              points={points}
              tileConfig={tileConfig}
              drawing={drawing}
              editable={!busy}
              fitRequest={fitRequest}
              onChange={changePoints}
              onFailure={() => {
                setTileFailed(true);
                setReviewed(false);
              }}
            />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4" role="status">
              <p>
                The map is unavailable. You can prepare a draft, but publishing requires reviewing
                it on the map.
              </p>
              {tileFailed && (
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setTileFailed(false);
                    setMapAttempt((value) => value + 1);
                  }}
                >
                  Retry map
                </Button>
              )}
            </div>
          )}
          <details className="rounded-xl border border-gray-200 p-4">
            <summary className="cursor-pointer font-semibold text-navy-900">
              Import GeoJSON or enter coordinates
            </summary>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-semibold" htmlFor={`${id}-file`}>
                GeoJSON file (one LineString, up to 2 MB)
              </label>
              <input
                id={`${id}-file`}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  if (file.size > MAX_ROUTE_PATH_FILE_BYTES) {
                    setError('Choose a GeoJSON file smaller than 2 MB.');
                    return;
                  }
                  setBusy(true);
                  try {
                    const text = await file.text();
                    const shape = parseRoutePathImport(text);
                    setPoints(shape.coordinates);
                    setReviewed(false);
                    setSource('import');
                    setDrawing(false);
                    setError(null);
                    setMessage(null);
                    setFitRequest((value) => value + 1);
                  } catch (failure) {
                    setError(
                      failure instanceof Error ? failure.message : 'Unable to read this file.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <label className="block text-sm font-semibold" htmlFor={`${id}-json`}>
                Paste GeoJSON
              </label>
              <textarea
                id={`${id}-json`}
                className="min-h-28 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm"
                disabled={busy}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy || !importText.trim()}
                onClick={() => importPath(importText)}
              >
                Preview imported path
              </Button>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-semibold" htmlFor={`${id}-lng`}>
                  Longitude
                  <input
                    id={`${id}-lng`}
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2"
                    value={longitude}
                    disabled={busy}
                    onChange={(event) => setLongitude(event.target.value)}
                  />
                </label>
                <label className="text-sm font-semibold" htmlFor={`${id}-lat`}>
                  Latitude
                  <input
                    id={`${id}-lat`}
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2"
                    value={latitude}
                    disabled={busy}
                    onChange={(event) => setLatitude(event.target.value)}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={busy || !longitude || !latitude}
                  onClick={() => {
                    const lng = Number(longitude),
                      lat = Number(latitude);
                    if (
                      !Number.isFinite(lng) ||
                      !Number.isFinite(lat) ||
                      Math.abs(lng) > 180 ||
                      Math.abs(lat) > 90
                    ) {
                      setError('Enter valid longitude and latitude.');
                      return;
                    }
                    changePoints([...points, [lng, lat]]);
                    setSource('admin_geojson');
                  }}
                >
                  Add path point
                </Button>
              </div>
            </div>
          </details>
          {validation && <p className="text-sm text-gray-600">{validation}</p>}
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger-700">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm font-semibold text-success-700">
              {message}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || Boolean(validation)}
              loading={busy && !confirmPublish}
              onClick={() => void saveDraft()}
            >
              Save draft
            </Button>
            <span className="text-sm text-gray-600">
              {unsaved
                ? 'Unsaved changes. Save a draft before publishing.'
                : selected
                  ? `Viewing saved ${selected.status} version ${selected.version}.`
                  : 'No path saved yet.'}
            </span>
          </div>
          {selected?.status === 'draft' && (
            <>
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={busy || unsaved || !mapAvailable || drawing}
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                I reviewed this saved path on the map and checked the roads, stop order, and return
                journey.
              </label>
              <Button disabled={!canPublish || drawing} onClick={() => setConfirmPublish(true)}>
                Publish reviewed path
              </Button>
            </>
          )}
          <p className="text-xs text-gray-500">
            Publishing replaces the current path for new runs. Runs already started keep their
            original path; start a new run to test an updated path.
          </p>
        </>
      )}
      {confirmPublish && (
        <ConfirmDialog
          open
          title="Publish this road path?"
          description={`Version ${selected?.version} will become the path for new runs on ${route.route_name}. The previous published version will be archived. Runs already started will keep their original path.`}
          confirmLabel="Publish path"
          destructive={false}
          busy={busy}
          onCancel={() => setConfirmPublish(false)}
          onConfirm={() => void publish()}
        />
      )}
    </Card>
  );
}
