# SafeBus Mobile App — Setup & Testing Guide

The SafeBus mobile app is a **native Android wrapper** around the existing
SafeBus web app, built with [Capacitor](https://capacitorjs.com/). It provides
a dedicated native experience for **drivers** and **guardians**, while tenant
admins and superadmins continue using the full web app on desktop/tablet.

## Architecture

```
apps/
  web/          # Full web app (admin + driver + guardian) — UNCHANGED
  mobile/       # Capacitor wrapper (driver + guardian + auth routes only)
    src/
      main.tsx              # Entry: BrowserRouter + AuthProvider + App
      App.tsx               # useRoutes(appRoutes)
      routes/router.tsx     # Mobile route subset (no admin routes)
      pages/
        AdminNotAvailablePage.tsx  # Friendly message for admins
    android/                # Generated Android Studio project
    capacitor.config.ts     # Capacitor config (appId, webDir)
```

### How it works (zero logic changes)

1. The mobile app's `vite.config.ts` aliases `@` → `apps/web/src`.
2. **All** pages, services, hooks, contexts, components, and types are imported
   directly from the web app source — no duplication.
3. The mobile `router.tsx` registers only auth + driver + guardian routes.
4. Capacitor wraps the Vite build output (`dist/`) in an Android WebView,
   producing a real `.apk` / `.aab`.

### What stays the same

- Supabase client, auth, session, RLS — unchanged
- `ProtectedRoute` role-gating — unchanged
- `getDashboardPath(role)` post-login redirect — unchanged
- All pages, services, hooks, components — unchanged
- Environment variables: still only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`

## Prerequisites

- **Android Studio** installed (with Android SDK)
- **Java JDK 17+** (bundled with Android Studio)
- **Android phone** with USB debugging enabled, or an Android emulator

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/mobile/.env` and fill in:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_ORIGIN=https://your-safebus-web-url.example.ca
```

> Use the **same** Supabase values as `apps/web/.env`.

### 3. Build and sync

```bash
cd apps/mobile
pnpm build
npx cap sync android
```

### 4. Open in Android Studio

```bash
cd apps/mobile
npx cap open android
```

Android Studio will open. Wait for Gradle sync to complete.

### 5. Run on your phone

1. Connect your Android phone via USB (USB debugging enabled).
2. Select your device from the dropdown in Android Studio.
3. Click the green **Run** ▶ button.

The app will install and launch on your phone.

## Android Permissions

The app requests these permissions (configured in `AndroidManifest.xml`):

| Permission | Purpose |
|---|---|
| `INTERNET` | Supabase API, map tiles |
| `ACCESS_NETWORK_STATE` | Online/offline detection for driver location retry |
| `ACCESS_FINE_LOCATION` | Driver live bus location tracking |
| `ACCESS_COARSE_LOCATION` | Approximate location fallback |
| `CAMERA` | Student QR badge scanning |

All hardware features (`gps`, `camera`) are marked `required="false"` so the
app installs on devices without them.

## Testing Driver Features

1. Sign in with a **driver** account.
2. **Location sharing**: Start an active trip → location permission prompt →
   bus location is shared live via `navigator.geolocation.watchPosition`.
3. **QR scanning**: Open Pickup & drop-off → "Open scanner" → camera activates
   → scan a student QR badge → confirm pickup/drop-off.

## Testing Guardian Features

1. Sign in with a **guardian** account.
2. **Live map**: View bus location on the map (react-leaflet).
3. **Live trips**: See active trip status.
4. **Events**: View pickup/drop-off event history.

## Admin Behavior on Mobile

If an admin signs in on the mobile app, they see a friendly message:

> "Admin access on web only — The SafeBus mobile app is built for drivers and
> guardians."

With a link to open the full web app in a browser.

## Development Workflow

After making changes to shared web app code:

```bash
cd apps/mobile
pnpm build          # Rebuild web assets
npx cap sync        # Sync into Android project
npx cap open android # Open in Android Studio → Run
```

For fast iteration, you can run the mobile app in a browser:

```bash
cd apps/mobile
pnpm dev            # Vite dev server at http://localhost:5174
```

This gives you the mobile route subset in a browser for quick testing.

## Building a Release APK

From Android Studio:

1. **Build** → **Generate Signed Bundle / APK**
2. Follow the wizard to create a keystore (first time) or use existing.
3. Choose **APK** for testing or **Android App Bundle** for Play Store.

## Validation

Before committing changes:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

All of these run across **both** `apps/web` and `apps/mobile`.