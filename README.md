# SafeBus Alberta

> Real-time school bus visibility for Alberta schools and parents.

SafeBus is a school transportation operations platform focused on driver trip workflow, live bus visibility, admin monitoring, guardian-scoped route visibility, and privacy-first student access control.

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
│   ├── functions/        # Edge Functions for approved milestones
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
# Optional public map tile configuration for admin fleet maps. Do not put secrets here.
VITE_MAP_TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png
VITE_MAP_TILE_ATTRIBUTION=Map data and tiles provided under the selected provider terms
```

`VITE_MAP_TILE_URL` and `VITE_MAP_TILE_ATTRIBUTION` are public browser configuration values for a future approved XYZ-compatible Leaflet tile provider. Both values must be configured for the interactive admin fleet map tile layer; otherwise the app shows a controlled non-tile fallback and keeps the fleet table available. Netlify must receive these values through its environment configuration when a provider is selected. No production provider is selected by default, and public OpenStreetMap standard tile servers should not be treated as an assumed production-scale commercial tile backend; OpenStreetMap data and the public tile service are separate concerns. Review provider terms, attribution, rate limits, availability, privacy, and commercial-use requirements before pilot production traffic.

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
- Guarded DEV-only fixture script:
  `SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY SAFEBUS_QA_SEED_DATABASE_URL=<DEV_DATABASE_URL> pnpm qa:seed:driver-events`

Never run QA seed scripts against production, and never use real student data.

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
