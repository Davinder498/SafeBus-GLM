/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * Deployed web app origin used for auth redirect URLs (password reset emails).
   * When unset, falls back to `window.location.origin` (web app behavior).
   * Set by the mobile (Capacitor) app so email links open in a browser.
   */
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
