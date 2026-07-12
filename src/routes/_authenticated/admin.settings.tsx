import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: () => <ComingSoon title="Settings" description="Full admin module ships in the next iteration." />,
});
