import { useEffect, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import {
  clearOfflineBanner,
  getOfflineBannerMessage,
  subscribeOfflineBanner,
} from "@/lib/offline-banner";

/**
 * Full-width status bar shown app-wide (mounted once, in the root layout)
 * when the offline fallback in `_authenticated/route.tsx`'s beforeLoad
 * kicks in. A toast wasn't the right fit here — it's a small, transient
 * corner popup, not a "you're offline" banner — so this reads from the
 * same tiny external store a persistent, dismiss-on-reconnect bar instead.
 */
export function OfflineBanner() {
  const message = useSyncExternalStore(subscribeOfflineBanner, getOfflineBannerMessage, () => null);

  // Belt-and-braces: hide as soon as the browser reports connectivity is
  // back, without waiting for the next navigation to re-run beforeLoad.
  useEffect(() => {
    window.addEventListener("online", clearOfflineBanner);
    return () => window.removeEventListener("online", clearOfflineBanner);
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex w-full items-center justify-center gap-2 bg-red-50 px-4 py-4 text-center text-sm font-medium text-slate-900 shadow-md"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
