import { createFileRoute } from "@tanstack/react-router";

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function handle(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return bad("Missing session", 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerData.user) return bad("Invalid or expired session", 401);

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("owner_id", callerData.user.id)
    .maybeSingle();
  if (!tenant) return bad("No restaurant found for this account", 404);

  const { error } = await (supabaseAdmin as any)
    .from("tenants")
    .update({ must_reset_password: false })
    .eq("id", tenant.id);
  if (error) return bad(error.message);

  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/clear-reset-flag")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
