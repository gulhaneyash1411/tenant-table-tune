import { createFileRoute } from "@tanstack/react-router";
import { deleteOutlet, getOutletDeletionImpact } from "@/lib/deletion.server";

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function handleGet(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = url.searchParams.get("outletId");

    if (!outletId) {
      return errorResponse("Outlet ID is required", 400);
    }

    // TODO: Add permission check - verify user is organization owner/admin
    // const user = await getCurrentUser(request);
    // const { data: org } = await supabase
    //   .from("tenants")
    //   .select("organization_id")
    //   .eq("id", outletId)
    //   .single();
    // if (!canDeleteOutlet(user, org?.organization_id)) {
    //   return errorResponse("Unauthorized", 403);
    // }

    const impact = await getOutletDeletionImpact(outletId);
    return Response.json({ success: true, impact });
  } catch (error: any) {
    console.error("Error getting deletion impact:", error);
    return errorResponse(
      error?.message || "Failed to get deletion impact",
      500
    );
  }
}

async function handlePost(request: Request) {
  try {
    const { outletId, confirmationText } = await request.json();

    if (!outletId) {
      return errorResponse("Outlet ID is required", 400);
    }

    // Safety check: Require confirmation text
    if (confirmationText !== "DELETE") {
      return errorResponse("Confirmation text must be 'DELETE'", 400);
    }

    // TODO: Add permission check
    // const user = await getCurrentUser(request);
    // const { data: outlet } = await supabase
    //   .from("tenants")
    //   .select("organization_id")
    //   .eq("id", outletId)
    //   .single();
    // if (!canDeleteOutlet(user, outlet?.organization_id)) {
    //   return errorResponse("Unauthorized", 403);
    // }

    const result = await deleteOutlet(outletId);
    return Response.json(result);
  } catch (error: any) {
    console.error("Error deleting outlet:", error);
    return errorResponse(
      error?.message || "Failed to delete outlet",
      500
    );
  }
}

export const Route = createFileRoute("/api/delete-outlet")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
