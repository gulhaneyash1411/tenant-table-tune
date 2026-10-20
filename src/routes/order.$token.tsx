import { createFileRoute, redirect } from "@tanstack/react-router";

// The URL printed on table QR codes: /order/{secure token}. The token (not the
// table's database id) is the only thing in the QR; the table page resolves it
// server-side and refuses revoked codes and unpaid/suspended outlets.
//
// `scan=1` tells the table page this is a fresh QR scan, so it should create a
// new ordering session. Without it the page only reuses an existing session,
// which prevents saved/bookmarked links from generating false orders.
export const Route = createFileRoute("/order/$token")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/t/$tableId",
      params: { tableId: params.token },
      search: { scan: "1" },
    });
  },
});
