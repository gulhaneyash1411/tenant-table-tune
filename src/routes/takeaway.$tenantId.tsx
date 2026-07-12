import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/takeaway/$tenantId")({
  component: () => <div className="min-h-screen grid place-items-center p-6"><ComingSoon title="Takeaway ordering" description="Walk-in parcel ordering ships next." /></div>,
});
