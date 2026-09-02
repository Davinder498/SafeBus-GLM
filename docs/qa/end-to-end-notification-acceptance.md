# End-to-End Notification Acceptance

Status: repository implementation complete for review. The Android push worker is implemented as a Supabase Edge Function. No migration, Edge Function, production secret, FCM delivery, tenant enablement, or RLS fixture has been applied or executed.

## Release gates

1. Human-review and merge the feature PR without mixing the driver-assignment milestone.
2. Apply `0092_end_to_end_notification_system.sql` and `0094_schedule_push_notification_dispatcher.sql` only to an approved isolated Supabase database. Run `tests/rls/notification-system-rls.sql` and cross-tenant, school-scope, driver-owner, guardian-expiry/revocation and token-secrecy cases there.
3. Record privacy/security approval, Firebase Cloud Messaging subprocessor approval, Google Play Data Safety evidence, tenant approval, quotas, incident owner and rollback authority.
4. Prepare a random, unique, minimum-32-character dispatcher secret in the approved password manager. Never place it or the Firebase service-account value in frontend env, source control, command output, screenshots, artifacts, or migration SQL.
5. Configure the protected GitHub `production` environment with secret `SUPABASE_ACCESS_TOKEN` and variable `SUPABASE_PROJECT_ID`. Keep the Android build secret `SAFEBUS_FIREBASE_GOOGLE_SERVICES_BASE64` in the protected `android-production` environment. The FCM service-account JSON belongs only in Supabase Edge Function Secrets.
6. Deploy schema first, then invoke the protected `Deploy push dispatcher` workflow for a full reviewed SHA already merged to `main`. The workflow deploys only `push-notification-dispatcher`, uses API bundling without Docker, and cannot prune other functions. The scheduled SQL remains dormant because its Vault entries do not exist yet.
7. In Supabase Edge Function Secrets, configure `SAFEBUS_FIREBASE_SERVICE_ACCOUNT_JSON` with the dedicated FCM service-account JSON and configure `SAFEBUS_PUSH_DISPATCHER_SECRET` with the prepared dispatcher secret. In Supabase Vault, create `safebus_project_url` with the canonical `https://<project-ref>.supabase.co` URL, then create `safebus_push_dispatcher_secret` with the same dispatcher secret last. This final Vault entry activates scheduler calls. Keep `push_notifications_enabled=false` until one approved tenant canary.
8. Validate foreground/background/killed Android display, permission prompt/denial/permanent-denial recovery, all three Android channels, generic lock-screen previews, notification taps after login, account switching, sign-out cleanup, invalid-token pruning, transient retry, quiet hours over DST and urgent bypass.
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

Then run Gradle `testDebugUnitTest lintDebug assembleDebug`. Hosted RLS, the one-minute `pg_cron`/`pg_net` invocation, the protected manual endpoint, and real FCM evidence stay pending until approved infrastructure exists.

## Rollback

Set the affected tenant's `push_notifications_enabled=false`, unschedule `safebus-push-notification-dispatcher` or remove its dispatcher secret from Vault, and revoke the Edge Function dispatcher secret and Firebase credential if compromised. Leave the additive inbox schema intact. In-app notifications continue to operate while external push is disabled.
