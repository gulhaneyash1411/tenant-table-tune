import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Kitchen Users have their own login page and must never be sent to the
    // Hotel Owner sign-in screen — everything else (owner + super admin)
    // keeps going to /auth exactly as before.
    const loginPath = location.pathname.startsWith("/kitchen") ? "/kitchen/login" : "/auth";

    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };
    if (error && isAuthRetryableFetchError(error)) {
      const { data: local } = await supabase.auth.getSession();
      if (local.session?.user) {
        toast.error("You're offline. We're showing your available data until your connection is restored.", {
          id: "offline",
        });
        return { user: local.session.user };
      }
    }

    throw redirect({ to: loginPath });
  },
  component: () => <Outlet />,
});
