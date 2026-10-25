import { APP_ENV, isProduction } from "@/config/env";

/**
 * Small fixed tag on every non-production build, so staging and local data
 * can't be mistaken for the live restaurant's. Renders nothing in production.
 * Bottom-left, clear of the top-right toasts and the full-width offline bar.
 */
export function EnvironmentBadge() {
  if (isProduction) return null;
  const label = APP_ENV === "staging" ? "STAGING" : "DEV";
  return (
    <div
      role="note"
      aria-label={`${label} environment — not the live site`}
      title="Not the live site: this build uses the staging / development database."
      className="pointer-events-none fixed bottom-2 left-2 z-[100] rounded bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow-md print:hidden"
    >
      {label}
    </div>
  );
}
