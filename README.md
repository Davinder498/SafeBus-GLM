# SafeBus Alberta

> Real-time school bus visibility for Alberta schools and parents.

SafeBus is a school transportation operations platform focused on live bus tracking, driver trip workflow, parent bus visibility, student pickup/drop-off confirmation (QR), admin monitoring, and privacy-first student access control.

**This is not a Student Information System.** SafeBus works alongside existing systems such as PowerSchool and SchoolEngage.

## Province

Initially for **Alberta, Canada** only. All privacy practices align with:
- **FOIP** (Freedom of Information and Protection of Privacy Act) — public bodies
- **PIPA** (Personal Information Protection Act) — private organizations
- **Education Act** — student record confidentiality

Data hosted in Canada (ca-central-1).

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
│   ├── functions/        # Edge Functions (ingest-location, process-scan, etc.)
│   └── seed/             # Demo data
└── docs/                 # PRD, Architecture, Security, Pilot Plan
```

## Getting Started

### Prerequisites
- Node.js 20+
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

## Build Phases

| Phase | Status | Goal |
|---|---|---|
| 0. Foundation | ✅ | Monorepo + CI + Supabase project |
| 1. Web UI | 🚧 | All web routes with mock data + shared components |
| 2. Backend | ⏳ | DB + auth + RLS + consent + terms |
| 3. Admin CRUD | ⏳ | Entity management + CSV import |
| 4. Driver Mobile | ⏳ | Expo app + login + trips |
| 5. GPS Tracking | ⏳ | Background GPS + 5s pings + stale/lost logic |
| 6. Parent + Notifications | ⏳ | Parent dashboard + push/email |
| 7. QR Scan | ⏳ | Badge generation + scanning + manual override |
| 8. Pilot Readiness | ⏳ | Reports + security review + PIA filed |

## Key Principles

- **Track the bus, not the child** — parents see only the assigned active bus
- **Privacy-first** — ASN never in QR, GPS only during active trips, 30-day retention
- **Tenant isolation** — RLS on every sensitive table
- **Plain language** — "Bus location temporarily unavailable" not "Realtime subscription stale"
- **Mobile first** — 320px minimum, 44×44px touch targets, WCAG 2.1 AA

## License

UNLICENSED — proprietary.
