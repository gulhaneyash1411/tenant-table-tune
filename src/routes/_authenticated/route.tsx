import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearOfflineBanner, showOfflineBanner } from "@/lib/offline-banner";
import { noindexHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Every portal page below this layout is login-only and not for search.
  head: noindexHead,
  beforeLoad: async ({ location }) => {
    // Kitchen Users and Sales Users each have their own dedicated login page
    // and must never be sent to the Hotel Owner sign-in screen. Everything
    // else (owner + super admin) keeps going to /auth exactly as before.
    const loginPath = location.pathname.startsWith("/kitchen")
      ? "/kitchen/login"
      : location.pathname.startsWith("/sales")
        ? "/sales/login"
        : "/auth";

    const { data, error } = await supabase.auth.getUser();
    if (data.user) {
      // Back on the normal (online) path — dismiss any offline banner a
      // previous navigation left showing.
      clearOfflineBanner();
      return { user: data.user };
    }
    if (error && isAuthRetryableFetchError(error)) {
      const { data: local } = await supabase.auth.getSession();
      if (local.session?.user) {
        showOfflineBanner(
          "You're offline. We're showing your available data until your connection is restored.",
        );
        return { user: local.session.user };
      }
    }

    throw redirect({ to: loginPath });
  },
  component: () => <Outlet />,
});
