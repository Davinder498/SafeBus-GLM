# End-to-End Notification Acceptance

Status: the notification foundation and Supabase Edge Function dispatcher are merged. Production canary setup confirmed the one-minute scheduler, tenant approval gate, guardian consent, device registration, inbox fan-out and Realtime delivery. The first FCM attempt exposed a device-refresh defect: repeated native registration replaced the active database row and orphaned queued delivery. Migration `0095_fix_idempotent_push_registration.sql` is the forward-only repair and remains subject to human review before production application.

## Release gates

1. Human-review and merge the feature PR without mixing the driver-assignment milestone.
2. Apply `0092_end_to_end_notification_system.sql`, `0094_schedule_push_notification_dispatcher.sql`, and `0095_fix_idempotent_push_registration.sql` only through the approved environment workflow. Run `tests/rls/notification-system-rls.sql` and cross-tenant, school-scope, driver-owner, guardian-expiry/revocation and token-secrecy cases only on a separately approved isolated database.
3. Record privacy/security approval, Firebase Cloud Messaging subprocessor approval, Google Play Data Safety evidence, tenant approval, quotas, incident owner and rollback authority.
4. Prepare a random, unique, minimum-32-character dispatcher secret in the approved password manager. Never place it or the Firebase service-account value in frontend env, source control, command output, screenshots, artifacts, or migration SQL.
5. Configure the protected GitHub `production` environment with secret `SUPABASE_ACCESS_TOKEN` and variable `SUPABASE_PROJECT_ID`. Keep the Android build secret `SAFEBUS_FIREBASE_GOOGLE_SERVICES_BASE64` in the protected `android-production` environment. The FCM service-account JSON belongs only in Supabase Edge Function Secrets.
6. Deploy schema first, then invoke the protected `Deploy push dispatcher` workflow for a full reviewed SHA already merged to `main`. The workflow deploys only `push-notification-dispatcher`, uses API bundling without Docker, and cannot prune other functions. The scheduled SQL remains dormant because its Vault entries do not exist yet.
7. In Supabase Edge Function Secrets, configure `SAFEBUS_FIREBASE_SERVICE_ACCOUNT_JSON` with the dedicated FCM service-account JSON and configure `SAFEBUS_PUSH_DISPATCHER_SECRET` with the prepared dispatcher secret. In Supabase Vault, create `safebus_project_url` with the canonical `https://<project-ref>.supabase.co` URL, then create `safebus_push_dispatcher_secret` with the same dispatcher secret last. This final Vault entry activates scheduler calls. Keep `push_notifications_enabled=false` until one approved tenant canary.
8. Confirm repeated token refresh returns the same active device id and does not strand a pending outbox row. Then validate foreground/background/killed Android display, permission prompt/denial/permanent-denial recovery, all three Android channels, generic lock-screen previews, notification taps after login, account switching, sign-out cleanup, invalid-token pruning, transient retry, quiet hours over DST and urgent bypass.
9. Validate inbox/badge/toast/filter/pagination/read/archive/accessibility on guardian, driver, tenant admin, transportation admin, school admin and platform admin accounts. Confirm revoked guardian access immediately hides student-scoped rows and cancels push.

## Automated checks

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:rls:notifications
pnpm migrations:verify
pnpm types:check
pnpm --filter @safebus/mobile cap:sync
```

Then run Gradle `testDebugUnitTest lintDebug assembleDebug`. Do not execute hosted RLS fixtures against the sole production project. Background and killed-app FCM acceptance remains open until migration `0095` is reviewed, applied, and verified on the approved canary.

## Rollback

Set the affected tenant's `push_notifications_enabled=false`, unschedule `safebus-push-notification-dispatcher` or remove its dispatcher secret from Vault, and revoke the Edge Function dispatcher secret and Firebase credential if compromised. Leave the additive inbox schema intact. In-app notifications continue to operate while external push is disabled.
