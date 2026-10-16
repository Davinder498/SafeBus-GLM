# SafeBus official domain and provider setup

Observed 2026-10-16. Configuration evidence only; email acceptance, live billing,
privacy approval and commercial launch approval are not established by this record.

## Owner-confirmed identity

- Public name / DBA: **SafeBus**.
- Operator and seller: **Sachman Gold Inc., an Alberta corporation**.
- Official origin: **https://safebus.kids**. This supersedes the earlier
  safebus.net instruction; no configuration was made for that earlier domain.
- Privacy lead: business owner. Monitored privacy/support/notice inboxes, business
  mailing address, registration documents and signing authority remain unresolved.
- Annual CAD price per licensed bus is undecided; owner reports no GST/HST
  registration. No price, automatic tax collection or payment transaction was created.

## Hosted observations

| Item                             | Evidence / result                                                                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website                          | Existing Netlify project `bussafe`, connected to SafeBus-GLM, serves https://safebus.kids over HTTPS                                                                                                  |
| Canonical host                   | safebus.kids is Primary domain; www.safebus.kids redirects to primary; existing Netlify hostname retained                                                                                             |
| TLS                              | Netlify reports HTTPS enabled, Let's Encrypt certificate for safebus.kids and *.safebus.kids, issued 2026-10-16                                                                                       |
| DNS                              | Netlify nameservers dns1–dns4.p05.nsone.net; public 1.1.1.1 resolves the delegation and sending CNAME; authoritative DNS resolves DMARC                                                               |
| Public privacy                   | https://safebus.kids/privacy loads the tenant, guardian and driver notices without authentication; operator already identifies Sachman Gold Inc.                                                      |
| Resend                           | Existing owner-selected account; verified domain `754adf1d-1eb0-4e6a-b777-30f030af064a`; North Virginia / us-east-1 / United States                                                                   |
| Resend transport                 | Enforced TLS saved and confirmed; non-TLS recipient servers fail delivery rather than receiving cleartext                                                                                             |
| Resend tracking / inbound        | No tracking subdomain configured; UI offers Enable tracking metrics. Receiving disabled. No inbox service is established                                                                              |
| Netlify non-secret configuration | Production-only SAFEBUS_APP_ORIGIN=https://safebus.kids; SAFEBUS_EMAIL_FROM=no-reply@safebus.kids; SAFEBUS_EMAIL_FROM_NAME=SafeBus                                                                    |
| Application email credential     | Owner confirms the Resend key was saved in Netlify on 2026-10-16; sending-only/domain-limited and production-secret forms were prepared; independent presence/scope check awaits browser reconnection |
| Auth email / callbacks           | Supabase dashboard sign-in required; custom SMTP and exact safebus.kids invitation/recovery callbacks remain unverified                                                                               |
| Stripe mode                      | Connected account acct_1UQz3oJPPdFvVToQ is SafeBus sandbox, livemode=false; live account not exposed through connector                                                                                |
| Stripe product                   | safebus_annual_bus_license: active, bus unit, product URL https://safebus.kids; legal_seller / trade_name / official_domain metadata updated; default_price remains null                              |
| Stripe portal                    | bpc_1UQzLTJPPdFvVToQGf4veWvy: return URL https://safebus.kids/admin/settings/billing; privacy https://safebus.kids/privacy; headline SafeBus billing — Sachman Gold Inc.                              |
| Stripe restrictions              | Billing details, invoices and payment methods enabled; subscription changes, cancellation and portal login page disabled; no unpublished terms URL added                                              |
| Stripe application wiring        | No Stripe credentials, webhook or live-payment readiness established; sandbox objects must not be linked to real production tenant billing records                                                    |

The Resend account login address is not treated as a business/privacy contact or
an authorized test recipient. The `no-reply` sender is not a monitored mailbox.
Netlify plan controls currently prevent selecting Functions-only scope for a new
secret; the prepared form marks it secret and leaves every non-production value
empty. Never expose it through a VITE_ variable or a screenshot.

## Saved DNS records

| Type    | Host relative to safebus.kids | Value                                                                                                             |
| ------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| NETLIFY | @                             | bussafe.netlify.app                                                                                               |
| NETLIFY | www                           | bussafe.netlify.app                                                                                               |
| TXT     | resend._domainkey             | Public DKIM value supplied by Resend, verified by the provider; copy the current provider record if reconfiguring |
| CNAME   | rsend                         | rsend.forge.rmta.net                                                                                              |
| CNAME   | send                          | send.forge.rmta.net                                                                                               |
| TXT     | _dmarc                        | v=DMARC1; p=none;                                                                                                 |

These are the account's actual provider-supplied records, not a generic SES
MX/SPF recipe. DMARC p=none is an initial observation policy, not enforcement;
review all legitimate senders before tightening it. No reporting mailbox was
invented. Domain verification does not prove inbox delivery or acceptable volume.

## Completion sequence

1. Owner reports completing the prepared domain-restricted sending-key creation
   and Netlify production-secret entry for SAFEBUS_EMAIL_PROVIDER_API_KEY.
   Independently verify only name/presence/scope after browser reconnection; never
   copy the value into chat, Git or logs. No delivery has yet been verified.
2. Owner signs into the existing BusSafe Supabase dashboard. Configure a separate
   domain-restricted Resend SMTP credential in the protected Auth settings, using
   the provider's current SMTP parameters. Credential entry stays with the owner.
3. Save Site URL https://safebus.kids and exact callbacks
   https://safebus.kids/accept-invitation and
   https://safebus.kids/update-password. Preserve required native callbacks and
   existing issued-link compatibility. Keep public signup disabled; no wildcard
   or session-security relaxation is needed.
4. Obtain a monitored inquiry recipient and owner-authorized test inbox. Do not
   infer these from a login account. With reviewed deployment/configuration,
   verify one bounded owned-inbox delivery plus invitation/recovery link handling;
   record acceptance without tokens or recipient details in public evidence.
5. Keep guardian event delivery behind the existing privacy and user opt-in gates.
   Review US message content, provider retention/terms, notices and customer
   instructions before activation. This milestone sends no QA notifications.
6. Complete live Stripe account verification in the correct seller's account,
   approved pricing, tax assessment and contract/public terms decisions. Use the
   [billing release runbook](stripe-subscription-release.md) for restricted server
   credentials, exact webhook events, signed delivery and deduplication acceptance.
   No production database, payout or deployment changes are authorized here.

## Repository changes

The native map-configuration endpoint and Android public-page verification
default use the official origin. Public/current operational documentation points
to safebus.kids; immutable migration evidence and historical observations stay
unchanged. The proposed privacy wording names Resend and accurately describes US
recipient/content/metadata processing. Readiness approvals remain not_approved;
new source/evidence digests do not approve these unresolved items.

Provider references checked 2026-10-16:
[Resend domains](https://resend.com/docs/dashboard/domains/introduction),
[Resend TLS](https://resend.com/docs/dashboard/domains/tls),
[Resend DPA](https://resend.com/legal/dpa),
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls).

## Validation and evidence digests

Local checks on 2026-10-16 passed: `pnpm typecheck`, `pnpm lint`, `pnpm build`
(web and mobile), `pnpm test` (383 web, 2 mobile and 348 release/local-PostgreSQL
tests; 733 total), changed-file Prettier check and `git diff --check`.
No hosted fixtures, SQL mutations or real notifications were used.

`pnpm operations:health` with SAFEBUS_MONITOR_ORIGIN=https://safebus.kids returned
healthy at 2026-10-16T15:46:25.400Z: landing, login SPA route and map configuration
all passed on the first attempt. Bounded HTTPS requests returned 200 for the
privacy, account-deletion and billing SPA routes too. Browser inspection confirmed
the homepage and role-specific privacy notice; HTTP 200 for a SPA shell does not
prove authenticated billing or an end-to-end email flow. Browser control then
disconnected, leaving credential-presence checks and Auth sign-in unresolved.

Current local working-tree SHA-256 evidence digests, recalculated after these
source changes (raw local file bytes; recalculate on the reviewed release host):

| Evidence collector       | Digest                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| privacy:digest           | fbcc602c2d3467ce42cb96269c08d84e3cc8f094e938635203353a5bdf652762 |
| map:digest               | 57502fd0d53a4015172bd6e9609709d8001513a677273c3e8d0277bc467c22c5 |
| operations:digest        | 1250787dea2650641de510614e185f7f2791766239931e2fda0b694169dd2510 |
| android:readiness:digest | 1eb029d49d335e84d0131215cadcd80041c36c1a9aeab1ba943e3fe0a3af2c95 |

These are review snapshots, not accepted approval digests. No readiness status,
approval, protected production-change control or migration evidence was changed.
