import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/app/api")({
  component: () => <ComingSoon title="Api" />,
});
