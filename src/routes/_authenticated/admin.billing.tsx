import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: () => <ComingSoon title="Billing" description="Full admin module ships in the next iteration." />,
});
