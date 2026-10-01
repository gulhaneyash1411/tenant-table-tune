import { createFileRoute } from "@tanstack/react-router";

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// Called by the kitchen login page right after a successful sign-in. Records
// the browser the kitchen account signed in from and lets the owner know when
// it is one they have not seen before.
async function handle(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return bad("Missing session", 401);

  let body: { device?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request body");
  }

  const device = typeof body.device === "string" ? body.device.trim() : "";
  // The client sends an opaque random id; keep the shape tight so nothing
  // unbounded reaches the database.
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(device)) return bad("Invalid device id");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !caller.user) return bad("Invalid or expired session", 401);

  const { data, error } = await (supabaseAdmin as any).rpc("record_kitchen_login", {
    p_user_id: caller.user.id,
    p_device_hash: device,
    p_user_agent: request.headers.get("user-agent"),
  });
  if (error) return bad(error.message);

  return Response.json({ ok: true, new_device: data === true });
}

export const Route = createFileRoute("/api/kitchen-device")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
