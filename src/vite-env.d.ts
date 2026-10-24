/// <reference types="vite/client" />

// Build-time variables. Every VITE_* value ends up in the browser bundle,
// so none of these may ever hold a service-role or other secret key.
interface ImportMetaEnv {
  readonly VITE_APP_ENV?: "development" | "staging" | "production";
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_CASHFREE_MODE?: "sandbox" | "production";
  readonly VITE_UPI_ID?: string;
  readonly VITE_UPI_PAYEE_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
