# Point 8 — Interactive Map Readiness

**Status:** Engineering controls complete; commercial operating evidence pending

**Decision owner:** Platform Administrator

**Last updated:** 2026-08-16

## 1. Required outcome

Commercial Readiness Point 8 requires an approved production map provider and
a safe degraded experience. A rendered map alone does not satisfy the gate.
The provider, commercial terms, privacy flow, attribution, quota, availability,
Android behavior, and outage experience must all be reviewable.

## 2. Implemented evidence

| Control | Evidence | State |
| --- | --- | --- |
| Provider selection | Geoapify selected through `DL-018`; free commercial pilot quota and paid 99.5% monthly SLA upgrade path reviewed | Implemented |
| Server-managed configuration | `map-tile-config` Netlify Function reads `GEOAPIFY_API_KEY`; no new frontend environment variable | Implemented |
| Provider lock | Client accepts only HTTPS XYZ templates from `maps.geoapify.com` | Implemented |
| Required attribution | Geoapify, OpenMapTiles, and OpenStreetMap attribution returned centrally and rendered by Leaflet | Implemented |
| Request minimization | Tile requests contain no SafeBus entity/account identifier; `strict-origin` referrer policy prevents route/path disclosure | Implemented |
| Configuration failure | Guardian, fleet, route, and route-edit screens retain status/list or direct-coordinate workflows | Implemented |
| Tile outage | Every tile layer treats a tile failure as degraded and removes the potentially misleading partial map | Implemented |
| Automated outage proof | Playwright scenarios simulate Geoapify HTTP 503 for guardian, fleet, route, and route-stop editing workflows | Implemented |
| Android integration | Capacitor uses the production config function from its `https://localhost` origin; release build contains no map key | Implemented |
| Structural release gate | `tests/release/map-readiness.test.mjs` prevents provider drift, direct frontend map variables, missing tile-error handling, or false completion claims | Implemented |

The Platform Administrator confirmed on 2026-08-16 that the deployed map is
configured and rendering. This confirms configuration, not sustained
availability or quota capacity.

## 3. Deliberate outage behavior

SafeBus does not silently fail over to OpenStreetMap community servers or an
unreviewed provider. During configuration or tile failure:

- guardians retain verified bus status and timestamps without a map;
- dispatch retains the fleet table and valid-location summary;
- route pages retain saved stop coordinates and stop lists; and
- route editing falls back to direct latitude/longitude entry with an explicit
  retry control.

A partial basemap is removed after a tile error because it can mislead a user
about roads, stops, or current coverage. Database/RPC data remains the
authoritative operational record.

## 4. Remaining operating evidence

The following actions cannot be completed by source code and remain mandatory:

- [ ] Activate a paid Geoapify plan with the published availability SLA before
  the first real school operation or paid availability commitment.
- [ ] Record the plan/subscription evidence reference without recording the API
  key or billing data in the repository.
- [ ] Confirm the production key restrictions include only approved web and
  Android origins; retain a redacted screenshot or vendor export.
- [ ] Confirm Geoapify processing locations, subprocessor terms, privacy terms,
  and any cross-border transfer with the Privacy Lead/counsel under Point 6.
- [ ] Configure and evidence quota/usage alerts at 70% and 90% under Point 9.
- [ ] Execute [`../qa/point-8-map-readiness-acceptance.md`](../qa/point-8-map-readiness-acceptance.md)
  on production web and a supported personal Android phone.
- [ ] Record seven consecutive operating days without unexplained provider
  failure or quota exhaustion before pilot authorization.
- [ ] Obtain final Platform Administrator sign-off after reviewing the above
  evidence.

Until these items are recorded, Point 8 must be reported as **engineering
complete, operating evidence pending**, not complete or commercially ready.

## 5. Point 8 exit record

| Item | Evidence reference | Owner | Date | Result |
| --- | --- | --- | --- | --- |
| Paid provider plan/SLA | _pending_ | Platform Administrator | | |
| Key restriction review | _pending_ | Security Lead | | |
| Vendor/privacy approval | _pending Point 6_ | Privacy Lead | | |
| Quota alerts | _pending Point 9_ | Operations Lead | | |
| Web outage acceptance | _pending_ | QA Lead | | |
| Android outage acceptance | _pending_ | QA Lead | | |
| Seven-day observation | _pending_ | Operations Lead | | |
| Final Point 8 approval | _pending_ | Platform Administrator | | |
