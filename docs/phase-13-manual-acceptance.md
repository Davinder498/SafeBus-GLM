# Phase 13 manual acceptance

Run only against hosted Supabase DEV and the Netlify deploy preview. Do not use
production data.

## Prerequisites

- Apply migrations through `0030_secure_trip_tracking_realtime.sql` in order.
- In Supabase Realtime settings, confirm private Broadcast is available and
  disable public channel access after verifying no accepted feature uses it.
- Prepare active QA records for Tenant One: Admin One, Driver One, Guardian
  One, Student One, Bus One, Route One, Pickup Stop, and Drop-off Stop.
- Link Guardian One to Student One, assign Student One to Route One, and create
  an active Driver One + Bus One route assignment.

## Driver device

1. Sign in as Driver One and start the assigned Route One trip.
2. Select **Start location sharing** and grant browser location permission.
3. Confirm the status progresses from waiting to active and shows a successful
   server-acknowledged update time.
4. Move safely or use device location simulation. Confirm updates continue at
   the MVP cadence without repeated overlapping requests.
5. Interrupt the device network. Confirm the UI reports offline and does not
   claim updates are active. Restore the network and confirm tracking resumes.
6. End the trip. Confirm location watching and submissions stop immediately.
7. Deny location permission once and confirm the UI gives a clear recovery
   instruction without starting submissions.

## Tenant admin

1. Sign in as Admin One and open **Live Fleet Monitoring**.
2. Confirm the active trip and actual Bus One/Driver One appear without student
   or guardian data.
3. Confirm the marker moves without a page refresh as Driver One publishes.
4. Interrupt and restore the admin network. Confirm markers are hidden while
   unverified and return only after a successful secured refresh.
5. Stop driver updates for more than two minutes. Confirm server-derived stale
   status replaces live status.
6. End the trip and confirm it disappears from the active fleet.
7. Disable map tiles and confirm the fleet table and status remain usable.

## Guardian

1. Sign in as Guardian One and open **Live Bus Map**.
2. Confirm only Student One context and the fresh serving-bus marker appear.
3. Confirm movement appears without page refresh.
4. Interrupt the guardian network. Confirm the marker disappears immediately;
   restore the network and confirm it returns only after a secured refresh.
5. Stop updates until stale and confirm no stale marker remains.
6. End the trip and confirm the marker disappears.
7. Remove or deactivate the Guardian One–Student One link and confirm location
   becomes unavailable without exposing the previous coordinate.
8. Verify multiple linked students and siblings on one bus remain correctly
   correlated and siblings share one marker.

## Negative security checks

- A driver without an active trip cannot publish.
- Driver One cannot publish for another driver's trip or another tenant.
- Guardian One cannot call the admin fleet RPC or directly select current or
  historical location tables.
- Guardian One cannot subscribe to another guardian or tenant topic.
- Admin One cannot subscribe to another tenant topic or view another tenant.
- Browser clients cannot publish tracking Broadcast messages.
- Duplicate/out-of-order invalidations never restore an older marker.
- Ended trips never continue publishing or appearing live.

Record device/browser versions, timestamps, failures, and screenshots in the
Phase 13 pull request. Do not merge until the product owner confirms every
applicable check passes.
