import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/admin/announcements")({
  component: () => <ComingSoon title="Announcements" description="Full admin module ships in the next iteration." />,
});
