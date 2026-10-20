import { createFileRoute, redirect } from "@tanstack/react-router";
import { scanQrAndCreateSession } from "@/lib/public-orders.functions";

// The URL printed on table QR codes: /order/{secure token}. Every fresh scan
// creates a new ordering session and redirects with the session token in the
// URL (?s=…). The token is what grants menu access — without it, or with an
// expired one, the table page shows "Session ended".
export const Route = createFileRoute("/order/$token")({
  beforeLoad: async ({ params }) => {
    let sessionToken: string | null = null;
    try {
      const result = await scanQrAndCreateSession({ data: { qr_key: params.token } });
      sessionToken = result.session_token;
    } catch {
      // Fall through — redirect without token shows "session ended"
    }
    throw redirect({
      to: "/t/$tableId",
      params: { tableId: params.token },
      search: sessionToken ? { s: sessionToken } : {},
    });
  },
});
