// Tiny external store bridging non-React code (the `_authenticated` route's
// `beforeLoad`, which runs outside the React tree) to a reactive banner in
// the root layout — same reason `sonner`'s toast() works from a loader, just
// scoped to this one piece of state so the banner can be a persistent full-
// width bar instead of a transient toast.
type Listener = () => void;

let message: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function showOfflineBanner(text: string) {
  message = text;
  emit();
}

export function clearOfflineBanner() {
  if (message === null) return;
  message = null;
  emit();
}

export function getOfflineBannerMessage() {
  return message;
}

export function subscribeOfflineBanner(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
