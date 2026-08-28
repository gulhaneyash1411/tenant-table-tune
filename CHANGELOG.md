# Changelog

All notable changes to this project are documented in this file.

## Changes — 2026-08-28

### Added
- **Show/hide toggle for password fields.** New shared `PasswordInput` component (`src/components/ui/password-input.tsx`) wraps the base `Input` with an eye / eye-off icon to reveal or mask the typed password. Applied everywhere a password is entered:
  - `src/routes/auth.tsx` — sign-in password, restaurant sign-up password
  - `src/routes/admin.auth.tsx` — super admin sign-in password
  - `src/routes/reset-password.tsx` — new password, confirm password
- **Live tenant sync between Settings and the app layout.** `useUserContext` (`src/hooks/use-session.ts`) now exposes a `setTenant` updater, and a new `TenantContextProvider` / `useTenantContext` lets nested `/app` routes push tenant changes straight into the layout's cached copy.
- Now , user is able to place an order , the supabase error is now resolved.

### Changed
- **Forgot-password flow UI.** On `/auth`, clicking "Forgot password?" now hides the "Sign in" / "Register restaurant" tab toggle while the reset-password form is shown, so it no longer appears alongside an unrelated flow (`src/routes/auth.tsx`).
- **Global branded loader now shows the PlateOS mark and rotates.** `BrandedLoader` (`src/components/branded-loader.tsx`), the shared full-screen loader used across the dashboard, admin console, and menu-loading screens, now renders the PlateOS Utensils mark (instead of a plain letter placeholder) when no tenant logo is available, and the logo itself continuously rotates (`animate-spin`, 1.6s per revolution) as a loading cue — no separate spinner ring.
- **Settings page updates the dashboard instantly.** `SettingsPage` (`src/routes/_authenticated/app.settings.tsx`) now calls `setTenant()` after a successful save, so the "complete your restaurant profile" banner and sidebar (`src/routes/_authenticated/app.tsx`) reflect the saved profile data immediately — previously this required a full page reload because the layout's tenant data was only fetched once on mount.

### Fixed
- **Stale "complete your profile" banner after saving Settings.** Saving address / owner phone / opening hours on the Settings page previously didn't clear the profile-incomplete banner or unlock gated pages until a hard refresh, because the `/app` layout cached the tenant once at mount and never re-read it. The layout now shares a live, updatable tenant via context (see *Added*), so the banner and locked-page state update on the same render as the save.

### Diagnosed (no code change)
- **"Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY"** on placing an order — the server-only `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` env vars (distinct from the client-side `VITE_SUPABASE_*` ones) were not set in `.env`.
- **"This restaurant is not accepting orders"** despite the tenant showing `approved` in the admin dashboard — traced to `SUPABASE_SERVICE_ROLE_KEY` belonging to a different Supabase project than `SUPABASE_URL` / `VITE_SUPABASE_URL`, so the server-side admin client was silently querying the wrong project. Resolved by copying the `service_role` key from the correct project.
