/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xyz.supabase.co */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase publishable (public) key — replaces the legacy anon key */
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
  /** App version injected at build time */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
