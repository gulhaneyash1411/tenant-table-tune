import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download } from "lucide-react";

export function QRCard({ url, title, subtitle }: { url: string; title: string; subtitle?: string }) {
  function download() {
    const svg = document.getElementById(`qr-${title}`);
    if (!svg) return;
    const s = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([s], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/\s+/g, "-")}.svg`;
    a.click();
  }
  return (
    <Card className="p-4 flex flex-col items-center gap-3 bg-card">
      <div className="text-sm font-medium">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground text-center">{subtitle}</div>}
      <div className="bg-white p-3 rounded-lg"><QRCodeSVG id={`qr-${title}`} value={url} size={160} /></div>
      <div className="text-[10px] text-muted-foreground truncate max-w-full">{url}</div>
      <Button size="sm" variant="outline" onClick={download}><Download className="h-3 w-3 mr-1"/>Download</Button>
    </Card>
  );
}