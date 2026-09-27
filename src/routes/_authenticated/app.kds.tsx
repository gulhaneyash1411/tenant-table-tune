import { createFileRoute } from "@tanstack/react-router";
import { KitchenDisplay } from "@/components/kitchen-display";

export const Route = createFileRoute("/_authenticated/app/kds")({ component: KitchenDisplay });
