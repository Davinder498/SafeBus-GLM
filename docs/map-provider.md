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
`map-tile-config` Netlify Function. With no additional settings, the function
uses the existing `GEOAPIFY_API_KEY` for both browser and native clients.
A **staged, optional** `GEOAPIFY_WEB_API_KEY` lets the website use a separately
restricted tile key while installed Android builds continue using the legacy
key. A future `GEOAPIFY_ANDROID_API_KEY` can be set only after native request
headers and provider restrictions are tested on a physical device. If a
channel-specific setting is present but invalid/blank, that channel fails
closed rather than silently using the legacy key.

Web calls use the same origin. The Capacitor Android origin
(`https://localhost`) calls the production function at
`https://safebus.kids/.netlify/functions/map-tile-config`.
Responses send `Vary: Origin` to prevent web/native key variants being
cross-served by HTTP/CDN caches.

The returned XYZ tile URL contains a **public client key**. Netlify storage
does not make a browser/mobile tile key secret; restrictions must be enforced
by the Geoapify provider. Origin in the config-function request is a routing
hint and can be forged, **not** mobile attestation or authorization. Native
WebViews may omit Referer/Origin on tile-image requests; do not assume web
restriction rules protect a mobile key.

Map requests contain no SafeBus account, student, guardian, driver, bus, or trip
identifier. Geoapify still receives the requested tile coordinates, device IP,
HTTP origin/referrer, and normal network metadata.

## Setup

1. The existing Geoapify project and production `GEOAPIFY_API_KEY` have been
   confirmed by the owner. **Keep the existing key unchanged** during setup.
   On November 6 the account showed 340 tile requests / 85 credits over the
   preceding 32 days with a 3,000-credit daily Free quota; this is historical
   low usage, not a production capacity test.
2. For the website, create **one additional key in the same project** named
   `SafeBus Web Production`. Confirm the actual `Referer` or `Origin`
   headers of browser tile requests and configure appropriate Geoapify
   restrictions for `https://safebus.kids`; don't guess regexes or accept
   `*` as a credential restriction. Test requests under the intended
   restriction before any rotation. Do not modify the legacy key yet.
3. After this code is merged and deployed, add the new credential to Netlify
   production **Functions** scope as `GEOAPIFY_WEB_API_KEY`, mark it secret,
   and redeploy the published site. Avoid `VITE_` prefixes and never paste
   values in Git, chat, or screenshots. The existing
   `GEOAPIFY_API_KEY` remains as Android/fallback. **Do not set**
   `GEOAPIFY_ANDROID_API_KEY` before supported physical-device acceptance.
4. For local development, keep `GEOAPIFY_API_KEY` in `apps/web/.env`
   and run `pnpm dev:netlify`. The optional web/native keys need not be
   present in development.
5. Confirm the map config function returns HTTP 200 without logging
   or documenting either key. Confirm the map still renders in the website
   and note which Geoapify key the project Statistics attributes its usage to:

   ```text
   /.netlify/functions/map-tile-config
   ```

6. Verify the guardian map, admin fleet map, routes map, and route-stop editor,
   and that no provider 403/429 errors occur. Confirm attribution at supported
   screen sizes. Test the selected Android native version before replacing its
   key or applying mobile-specific restrictions.
7. If the web key is rejected by Geoapify, **rollback only**
   `GEOAPIFY_WEB_API_KEY` in Netlify and redeploy; the previous legacy key
   still serves the website. Do not remove the old Geoapify key until both
   production web and signed Android distribution are verified.

## Reliability and cost controls

- The config response is cached for five minutes and may be served stale for a
  day by the CDN during revalidation. Client config fetches have an eight-second
  timeout, retry a transient error once, and then respect a one-minute cooldown.
  Mounted map views retry after the cooldown instead of permanently caching
  their first failure. Concurrent views share one in-flight request. A
  successful config remains cached in the current app session.
- Existing map surfaces retain their controlled list/status fallback when the
  provider or configuration is unavailable. Guardian, live-fleet, routes, and
  trip maps now offer an explicit **Retry map** action after tile errors. Route
  stop and route-path editing already provided their own retry action. Retry
  remounts the map only when requested; it does not switch to an unapproved
  supplier or alter transport records.
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
