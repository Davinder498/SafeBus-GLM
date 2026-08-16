# Point 8 Map Readiness — Manual Acceptance

**Status:** Pending execution

Run this checklist only against the deployed SafeBus application and existing
authorized accounts. Do not create database fixtures, modify production data,
or capture live bus coordinates in screenshots.

## Evidence safety

- Redact API keys, user email addresses, student names, bus locations, and
  browser storage from every artifact.
- Record the tested commit SHA, application URL, Android version/device class,
  date, tester, and pass/fail result.
- Store evidence in the approved restricted evidence location and place only a
  non-secret reference in the Point 8 exit record.

## Web acceptance

- [ ] Guardian live map renders, displays required attribution, and shows only
  the linked student's assigned active bus.
- [ ] Admin live fleet map renders markers above route-stop overlays and the
  fleet list remains authoritative.
- [ ] Route detail map renders saved stops with correct numbering.
- [ ] Route-stop editor can place and drag a stop and retains direct coordinate
  inputs.
- [ ] Browser network requests to Geoapify contain no SafeBus account, student,
  guardian, driver, bus, trip, or tenant identifier.
- [ ] The cross-origin referrer contains only the SafeBus origin, not a page
  path or query string.

## Outage acceptance

Block `maps.geoapify.com` in browser developer tools or an approved test
network. Do not change the production API key.

- [ ] Guardian map is removed and verified bus status remains readable.
- [ ] Admin map is removed and fleet list/current-location summary remains
  readable.
- [ ] Route map is removed and saved route/stop information remains readable.
- [ ] Route editor presents direct coordinate entry and a map retry control.
- [ ] No screen substitutes community OpenStreetMap tiles or another provider.
- [ ] Restoring network access and reloading/retrying restores the approved map.

## Android acceptance

- [ ] Repeat guardian rendering and outage checks on a supported personally
  owned Android phone using cellular data and Wi-Fi.
- [ ] Rotate the device between portrait and landscape; the map resizes without
  hiding attribution or status controls.
- [ ] Background/foreground the app and confirm the map recovers without
  affecting active driver tracking.
- [ ] Confirm the Android bundle contains no `GEOAPIFY_API_KEY` environment
  setting or hard-coded key.

## Capacity and provider evidence

- [ ] Geoapify dashboard shows expected tile usage for the test sessions.
- [ ] 70% and 90% usage/quota notifications are configured and routed to the
  approved operations contact.
- [ ] Paid-plan/SLA and restricted-key evidence references are recorded in
  `docs/governance/point-8-map-readiness.md`.
