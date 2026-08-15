# SafeBus Alberta

> Real-time school bus visibility for Alberta schools and parents.

SafeBus is a school transportation operations platform focused on driver trip workflow, live bus visibility, admin monitoring, guardian-scoped route visibility, and privacy-first student access control.

**This is not a Student Information System.** SafeBus works alongside existing systems such as PowerSchool and SchoolEngage.

## Province

Initially for **Alberta, Canada** only. The privacy-law framework is being
finalized by Alberta privacy counsel in **Phase 3** against:

- **POPA** — Protection of Privacy Act principles
- **ATIA** — Access to Information Act principles
- **PIPA** (Personal Information Protection Act) — private organizations
- **Education Act** — student record confidentiality

> **Note:** Earlier versions of this README referenced _FOIP_. That reference
> was obsolete for SafeBus's legal-role analysis and is corrected in Phase 3
> (see `docs/governance/risk-register.md` R-006 and
> `docs/governance/phase-3/legal-role-analysis.md`). Final statutory mapping
> is confirmed by counsel, not engineering.

The intended hosted region is Canada (`ca-central-1`). Production processing,
backup location, and subprocessor terms remain blocked on the Phase 3 vendor
verification and counsel gates; this repository does not claim those reviews
are complete.

## Monorepo Structure

```
safebus-alberta/
├── apps/
│   ├── web/              # React/Vite — admin + parent portals + driver demo
│   └── driver-mobile/    # Expo/React Native — production driver app (Phase 4)
├── packages/
│   ├── types/            # Shared TypeScript types (single source of truth)
│   ├── api/              # Supabase client + typed API helpers + Zod validation
│   ├── ui/               # Shared component library (19 components)
│   └── config/           # Shared tsconfig, eslint config
├── supabase/
│   ├── migrations/       # Database schema + RLS policies
│   ├── functions/        # Edge Functions for approved milestones
│   └── seed/             # Demo data
└── docs/                 # PRD, Architecture, Security, Pilot Plan
```

## Getting Started

### Prerequisites

- Node.js 22.22+
- pnpm 11+ (`npm install -g pnpm`)
- Hosted Supabase project URL and anon key

### Install

```bash
pnpm install
```

Create `apps/web/.env` with your hosted Supabase project values:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Frontend code may use only these two environment variables. No production
map provider is approved; map surfaces use a controlled non-tile fallback.

### Run web app (Phase 1 — mock data)

```bash
pnpm --filter @safebus/web dev
```

Open http://localhost:5173

### Run web app build

```bash
pnpm build
```

### Typecheck

```bash
pnpm typecheck
```

## QA Helpers

- Driver manifest and pickup/drop-off manual QA playbook:
  `docs/qa/driver-event-flow-manual-test.md`
- Guarded non-production fixture tooling exists, but it is not currently
  runnable because the only database is production.

Never run QA seed scripts against production, and never use real student data.

## Secure release platform

Phase 4 release controls, environment isolation, Canadian-region approval,
migration integrity, security gates, and recovery procedures are documented in
[`docs/governance/phase-4/README.md`](docs/governance/phase-4/README.md).

Useful local verification commands:

```bash
pnpm migrations:verify
pnpm security:audit
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:smoke
```

Real RLS execution requires a separately approved, database-registered
non-production target. None currently exists, so hosted RLS and QA writers are
disabled. Production releases run only through the protected GitHub production
environment; production credentials are not part of local setup.

## Build Phases

| Phase                            | Status | Goal                                                    |
| -------------------------------- | ------ | ------------------------------------------------------- |
| 0. Foundation                    | ✅     | Monorepo + CI + Supabase project                        |
| 1. Web UI                        | 🚧     | All web routes with mock data + shared components       |
| 2. Backend                       | ⏳     | DB + auth + RLS + consent + terms                       |
| 3. Admin CRUD                    | ⏳     | Entity management + CSV import                          |
| 4. Driver Mobile                 | ⏳     | Expo app + login + trips                                |
| 5. GPS Tracking                  | ⏳     | Background GPS + 5s pings + stale/lost logic            |
| 6. Guardian Live Trip Visibility | ✅     | Guardian-scoped active-trip visibility                  |
| 7. QR Scan / Notifications       | ⏳     | Future scope; not implemented until explicitly approved |
| 8. Pilot Readiness               | ⏳     | Reports + security review + PIA filed                   |

## Key Principles

- **Track the bus, not the child** — parents see only the assigned active bus
- **Privacy-first** — no Alberta Student Number, GPS only during active trips, tenant-scoped access
- **Tenant isolation** — RLS on every sensitive table
- **Plain language** — "Bus location temporarily unavailable" not "Realtime subscription stale"
- **Mobile first** — 320px minimum, 44×44px touch targets, WCAG 2.1 AA

## License

UNLICENSED — proprietary.
