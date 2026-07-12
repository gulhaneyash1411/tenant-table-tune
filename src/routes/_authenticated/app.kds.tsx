import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/app/kds")({
  component: () => <ComingSoon title="Kds" />,
});
