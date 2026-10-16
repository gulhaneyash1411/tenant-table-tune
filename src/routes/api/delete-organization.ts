import { createFileRoute } from "@tanstack/react-router";
import { deleteOrganization, getOrganizationDeletionImpact } from "@/lib/deletion.server";

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function verifySuperAdmin(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "super_admin");
  if (!roles || roles.length === 0) return null;
  return data.user;
}

async function handleGet(request: Request) {
  try {
    if (!(await verifySuperAdmin(request))) return errorResponse("Unauthorized", 403);

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId");
    if (!orgId) return errorResponse("Organization ID is required", 400);

    const impact = await getOrganizationDeletionImpact(orgId);
    return Response.json({ success: true, impact });
  } catch (error: any) {
    console.error("Error getting deletion impact:", error);
    return errorResponse(error?.message || "Failed to get deletion impact", 500);
  }
}

async function handlePost(request: Request) {
  try {
    if (!(await verifySuperAdmin(request))) return errorResponse("Unauthorized", 403);

    const { orgId, confirmationText } = await request.json();
    if (!orgId) return errorResponse("Organization ID is required", 400);
    if (confirmationText !== "DELETE") return errorResponse("Confirmation text must be 'DELETE'", 400);

    const result = await deleteOrganization(orgId);
    return Response.json(result);
  } catch (error: any) {
    console.error("Error deleting organization:", error);
    return errorResponse(error?.message || "Failed to delete organization", 500);
  }
}

export const Route = createFileRoute("/api/delete-organization")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
