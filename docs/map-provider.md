# Map provider configuration

## Decision

SafeBus uses **Geoapify Map Tiles** with the existing Leaflet renderer for the
free pilot. Geoapify permits commercial use on its free plan, includes 3,000
credits per day, and currently charges 0.25 credits per map tile. Paid plans
publish a 99.5% monthly availability SLA. This provides a no-rewrite upgrade
path if the pilot volume or launch reliability requirement exceeds the free
plan.

The free plan is an evaluation/pilot configuration, not final evidence of
commercial reliability. Before launch, the owner must review actual tile usage,
execute the required vendor/privacy terms, confirm processing locations, and
choose a paid plan if the 99.5% SLA is required.

Rejected production defaults:

- `tile.openstreetmap.org`: community-funded, best-effort, no SLA, and access
  may be blocked or withdrawn. It must not be configured in SafeBus.
- OpenFreeMap public instance: commercial use and unlimited requests are
  permitted, but there is currently no SLA or personalized support.
- MapTiler and Stadia Maps free plans: non-commercial/evaluation only.

## Architecture

The browser and Android app do not read a map API key from a `VITE_` variable.
They request a provider-neutral XYZ URL and attribution from the
`map-tile-config` Netlify Function. The function reads the server-only
`GEOAPIFY_API_KEY` setting and returns only the public, restricted client tile
URL. Web calls use the same origin. The Capacitor Android origin
(`https://localhost`) calls the production function at
`https://bussafe.netlify.app/.netlify/functions/map-tile-config`.

Map requests contain no SafeBus account, student, guardian, driver, bus, or trip
identifier. Geoapify still receives the requested tile coordinates, device IP,
HTTP origin/referrer, and normal network metadata.

## Setup

1. Create a Geoapify project and key.
2. Restrict the key to the approved production web origin and the Android
   Capacitor origin (`https://localhost`). Add local web origins only while
   actively developing.
3. Set `GEOAPIFY_API_KEY` in the Netlify production environment. Never prefix it
   with `VITE_`, commit it, or copy it into the Android environment.
4. For local web development, put `GEOAPIFY_API_KEY` in `apps/web/.env` and run
   `pnpm dev:netlify` so the local function is available.
5. Confirm the function returns HTTP 200 without logging or recording the key:

   ```text
   /.netlify/functions/map-tile-config
   ```

6. Verify the guardian map, admin fleet map, routes map, and route-stop editor.
   Confirm the attribution remains visible at every supported screen size.

## Reliability and cost controls

- The config response is cached for five minutes and may be served stale for a
  day by the CDN during revalidation; the client retries one failed config
  request.
- Existing map surfaces retain their controlled list/status fallback when the
  provider or configuration is unavailable.
- Record Geoapify usage during the pilot. The free allowance equates to 12,000
  tile requests per day at the current 0.25-credit tile rate.
- Set an operational alert before 70% and 90% of the daily quota. Do not wait
  for visible map failures.
- Complete a provider-outage acceptance test and retain evidence before pilot
  authorization.

Official references:

- <https://www.geoapify.com/pricing/>
- <https://apidocs.geoapify.com/docs/maps/>
- <https://operations.osmfoundation.org/policies/tiles/>
- <https://openfreemap.org/>
- <https://www.maptiler.com/cloud/pricing/>
- <https://stadiamaps.com/pricing>
