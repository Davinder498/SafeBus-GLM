# Guardian map viewport and Geoapify tile usage — 2026-11-06

**Status:** UI-only optimization prepared for review, not a measured cost saving.
No provider key, route/trip/GPS logic, user scope, RLS, or notification changes.

## Previous map behaviour

The guardian Leaflet map re-framed on every changed location coordinate.
Frequent live updates could keep moving the map and request tiles across
additional boundaries even when the guardian had not asked to follow the bus.
Map tiles are requested by Leaflet for the viewport; the RPC/GPS poll itself
does **not** incur Geoapify credits.

## Updated behaviour

- The initial available bus and assigned stop locations are framed once.
- By default, subsequent GPS updates move existing bus markers and preserve
  the guardian's chosen map viewport. The map remains interactive.
- An accessible **Follow bus** button explicitly enables viewport following
  using current bus coordinates (not unrelated stop positions).
- When following is active, **Stop following** disables automatic recentering.
  A direct map drag also turns off following so manual exploration works.
- If no current bus marker is available, following cannot be enabled.
- Tile provider errors still hide the map and preserve the verified status
  fallback. Existing user role, GPS freshness and permission checks are intact.

**Limits:** Following intentionally permits additional tile requests when the
bus moves. Default stationary mode avoids avoidable viewport movement but
does not eliminate initial tile loads, user-driven exploration or caching
effects. The extent of real Geoapify savings needs dashboard credit
measurements for a comparable workload. No quotas or subscription claims
are made. A change to the Android web UI will only reach signed devices after
a later reviewed mobile build/release.

The existing production Netlify `GEOAPIFY_API_KEY` was present in masked
settings during the review, while the operator reported having no Geoapify
account. Ownership, restrictions and quota for that key are **unverified**.
Before onboarding a customer, create a SafeBus-owned account and project,
configure the replacement key with appropriate HTTP-referrer/origin
restrictions, test both web and native map requests, and only then retire
the prior key. Avoid copying keys into Git, customer tickets or chat.

Geoapify references:
- https://myprojects.geoapify.com/help/
- https://myprojects.geoapify.com/help/api-keys/
- https://www.geoapify.com/pricing/
