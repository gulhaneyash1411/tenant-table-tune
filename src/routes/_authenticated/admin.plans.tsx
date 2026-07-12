import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/admin/plans")({
  component: () => <ComingSoon title="Plans" description="Full admin module ships in the next iteration." />,
});
