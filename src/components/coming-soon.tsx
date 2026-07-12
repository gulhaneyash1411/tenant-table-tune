import { Card } from "@/components/ui/card";
import { Rocket } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">{title}</h1>
      <Card className="p-10 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary grid place-items-center mb-4">
          <Rocket className="h-6 w-6" />
        </div>
        <div className="text-lg font-medium">Coming in a future phase</div>
        <p className="text-muted-foreground mt-2">{description || "This module is planned in the PlateOS roadmap. Ping support if you'd like to prioritise it for your plan."}</p>
      </Card>
    </div>
  );
}