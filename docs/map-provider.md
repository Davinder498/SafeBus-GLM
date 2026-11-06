# Map provider configuration

## Decision

SafeBus uses **Geoapify Map Tiles** with the existing Leaflet renderer for the
free pilot. Geoapify permits commercial use on its free plan, includes 3,000
credits per day, and currently charges 0.25 credits per map tile. Paid plans
publish a 99.5% monthly availability SLA. This provides a no-rewrite upgrade
path if the pilot volume or launch reliability requirement exceeds the free
plan.

The free plan is an evaluation/pilot configuration, not final evidence of
commercial reliability. A paid plan carrying the published 99.5% SLA must be
activated before the first real school operation or paid availability
commitment. Before launch, the owner must also review actual tile usage,
execute the required vendor/privacy terms, and confirm processing locations.

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
`https://safebus.kids/.netlify/functions/map-tile-config`.

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
- Record **project-wide credit usage** during the pilot, not only tile counts
  for one API key. All keys in a Geoapify project share the same credit quota
  and other Geoapify API calls can consume credits.
- The currently published Free plan is 3,000 credits/day. Its reference 70% and
  90% thresholds are 2,100 and 2,700 credits/day respectively. At the existing
  0.25-credit map-tile cost they equal 8,400 and 10,800 map tiles **only if
  all project consumption is tiles**. Re-read the actual plan/quota before
  assessing thresholds.
- Geoapify project Statistics provides usage information. We have not verified
  a supported project-usage API or provider-native threshold notification
  feature, so do not describe a working automatic monitor. Use the
  [operator quota review](operations/geoapify-quota-review.md) until an
  authoritative live integration and two delivered alert drills are approved.
- Set and verify an actual operational alert at 70% and 90% before pilot
  authorization. Do not wait for visible map failures or count the local
  evaluator as active alerts.
- Complete a provider-outage acceptance test and retain evidence before pilot
  authorization.
- SafeBus deliberately does not fail over to a community or unreviewed tile
  provider. A provider failure removes the potentially misleading partial map
  and retains authoritative status/list/direct-coordinate workflows.

Point 8 engineering and operating evidence is tracked in
[`governance/point-8-map-readiness.md`](governance/point-8-map-readiness.md).

Official references:

- <https://www.geoapify.com/pricing/>
- <https://apidocs.geoapify.com/docs/maps/>
- <https://operations.osmfoundation.org/policies/tiles/>
- <https://openfreemap.org/>
- <https://www.maptiler.com/cloud/pricing/>
- <https://stadiamaps.com/pricing>
