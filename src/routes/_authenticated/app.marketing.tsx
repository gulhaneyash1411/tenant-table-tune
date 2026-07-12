import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/app/marketing")({
  component: () => <ComingSoon title="Marketing" />,
});
