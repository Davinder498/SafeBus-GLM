# End-to-End Notification Acceptance

Status: repository implementation complete for review. No migration, production deploy, FCM delivery, tenant enablement, or RLS fixture has been executed.

## Release gates

1. Human-review and merge the feature PR without mixing the driver-assignment milestone.
2. Apply `0092_end_to_end_notification_system.sql` only to an approved isolated Supabase database. Run `tests/rls/notification-system-rls.sql` and cross-tenant, school-scope, driver-owner, guardian-expiry/revocation and token-secrecy cases there.
3. Record privacy/security approval, Firebase Cloud Messaging subprocessor approval, Google Play Data Safety evidence, tenant approval, quotas, incident owner and rollback authority.
4. Configure protected Netlify `SAFEBUS_FIREBASE_SERVICE_ACCOUNT_JSON` and `SAFEBUS_PUSH_DISPATCHER_SECRET`; configure protected GitHub environment `SAFEBUS_FIREBASE_GOOGLE_SERVICES_BASE64`. Never place these values in frontend env, logs, screenshots, artifacts or the repository.
5. Deploy schema first, application/functions second, secrets third. Keep `push_notifications_enabled=false` until one approved tenant canary.
6. Validate foreground/background/killed Android display, permission prompt/denial/permanent-denial recovery, all three Android channels, generic lock-screen previews, notification taps after login, account switching, sign-out cleanup, invalid-token pruning, transient retry, quiet hours over DST and urgent bypass.
7. Validate inbox/badge/toast/filter/pagination/read/archive/accessibility on guardian, driver, tenant admin, transportation admin, school admin and platform admin accounts. Confirm revoked guardian access immediately hides student-scoped rows and cancels push.

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

Then run Gradle `testDebugUnitTest lintDebug assembleDebug`. Hosted RLS and real FCM evidence stay pending until approved infrastructure exists.

## Rollback

Set the affected tenant's `push_notifications_enabled=false`, disable the Netlify push schedule, revoke Firebase credentials if compromised, and leave the additive inbox schema intact. In-app notifications continue to operate while external push is disabled.
