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

The operator subsequently confirmed an existing Geoapify account and an
API key already configured as `GEOAPIFY_API_KEY` in Netlify. Read-only
browser access confirmed the operator is signed into a Geoapify project's
API-key settings. **No new account or key is needed if the production key
belongs to this project and has suitable restrictions.** The account's key
and Netlify's masked production value have not been compared, so ownership,
restriction coverage, current plan and quota remain to be verified.

The operator should compare the values privately in Geoapify and Netlify,
without copying the API key into Git, chat or tickets. Inspect the actual
project Statistics and Plan & Billing pages, and confirm any referrer/origin
restrictions work for both the production website and the Android WebView.
Do not rotate or replace the working key unless a mismatch or unsafe
restriction is established; test web/native rendering before any approved
rotation.

Geoapify references:
- https://myprojects.geoapify.com/help/
- https://myprojects.geoapify.com/help/api-keys/
- https://www.geoapify.com/pricing/
