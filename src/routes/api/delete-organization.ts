import { createFileRoute } from "@tanstack/react-router";
import { deleteOrganization, getOrganizationDeletionImpact } from "@/lib/deletion.server";

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function handleGet(request: Request) {
  try {
    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId");

    if (!orgId) {
      return errorResponse("Organization ID is required", 400);
    }

    // TODO: Add permission check - verify user is super admin
    // const user = await getCurrentUser(request);
    // if (!user?.is_super_admin) {
    //   return errorResponse("Unauthorized", 403);
    // }

    const impact = await getOrganizationDeletionImpact(orgId);
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
    const { orgId, confirmationText } = await request.json();

    if (!orgId) {
      return errorResponse("Organization ID is required", 400);
    }

    // Safety check: Require confirmation text
    if (confirmationText !== "DELETE") {
      return errorResponse("Confirmation text must be 'DELETE'", 400);
    }

    // TODO: Add permission check
    // const user = await getCurrentUser(request);
    // if (!user?.is_super_admin) {
    //   return errorResponse("Unauthorized", 403);
    // }

    const result = await deleteOrganization(orgId);
    return Response.json(result);
  } catch (error: any) {
    console.error("Error deleting organization:", error);
    return errorResponse(
      error?.message || "Failed to delete organization",
      500
    );
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
