import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
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

    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
