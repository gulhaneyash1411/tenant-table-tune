import { createFileRoute, redirect } from "@tanstack/react-router";

// The URL printed on table QR codes: /order/{secure token}. The token (not the
// table's database id) is the only thing in the QR; the table page resolves it
// server-side and refuses revoked codes and unpaid/suspended outlets.
export const Route = createFileRoute("/order/$token")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/t/$tableId", params: { tableId: params.token } });
  },
});
