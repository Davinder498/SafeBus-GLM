# Geoapify web/native tile key segregation — November 6, 2026

**Status:** Staged code change only. NOT a security restriction activation,
live native-device acceptance, or Point 8 launch approval.

The operator confirmed an existing Geoapify project and matching active Netlify
`GEOAPIFY_API_KEY`; the provider UI currently reports **no restrictions** on
allowed IPs, HTTP Referers or Origins. The project usage for Oct 6–Nov 6 was
340 tile requests / 85 credits total, against the plan's 3,000 daily credits.

Geoapify recommends using different browser/mobile application keys to permit
different restrictions and independent usage attribution. Same-project keys
share one plan/quota, so new keys do not multiply daily credits.

## Non-disruptive selection and verification

| Incoming config request | Production setting | If absent |
| --- | --- | --- |
| Browser / same-origin | `GEOAPIFY_WEB_API_KEY` | Existing `GEOAPIFY_API_KEY` |
| Known native WebView Origin (`https://localhost` or `capacitor://localhost`) | `GEOAPIFY_ANDROID_API_KEY` | Existing `GEOAPIFY_API_KEY` |

`Vary: Origin` prevents HTTP caches from mixing the two public tile URL
variants. A present-but-blank override fails only that channel closed.
All existing GET/OPTIONS behavior, required attribution, fixed tile host,
provider outage fallback, and browser role authorizations remain unchanged.

**Important:** Origin headers are spoofable and provide no app authentication;
native apps may send tile-image requests without Referer/Origin, so Android
keys must be treated as public and their policy tested before any restriction.
This change is not a prevention mechanism for key extraction. The server's
Netlify secret storage is not itself protection against copying a public tile
URL displayed to a browser.

## Sequenced rollout

1. Merge after exact-head CI/CodeQL and human review. This code with no
   new environment variables selects the current key for both channels.
2. Create a new key in the same Geoapify project for the production website.
   Configure allowed browser Referer/Origin values based on **observed** network
   headers. Do not reveal the key to chat or source control.
3. Add `GEOAPIFY_WEB_API_KEY` as a Netlify production Function secret and
   redeploy. Verify live web tiles and all map-related screens, including
   outage fallback and required attribution.
4. Leave the existing `GEOAPIFY_API_KEY` alone for signed Android 1.0.7
   until deferred physical-device acceptance. If web tile requests fail,
   remove only the new override and redeploy to restore the current web key.
5. Investigate mobile-specific restrictions and provider key lifecycle using
   real device network traces and documented provider support. Only then
   evaluate `GEOAPIFY_ANDROID_API_KEY` and revoking the old key.
6. Monitor project and per-key credit usage. This change does not provision
   automatic 70/90 alerts, purchase a plan, or alter supplier agreements.

Do not change database permissions, keys in deployed Android binaries,
shipping versions, SaaS billing, provider plan, map geometry, GPS, quota caps
or any release approvals as part of this PR.

Sources:
- https://myprojects.geoapify.com/help/api-keys/
- https://apidocs.geoapify.com/how-to/maps/react-native-maplibre-map
