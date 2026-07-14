import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function QRCard({ url, title, subtitle, onDelete }: { url: string; title: string; subtitle?: string; onDelete?: () => void }) {
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
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={download}><Download className="h-3 w-3 mr-1"/>Download</Button>
        {onDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="h-3 w-3 mr-1"/>Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{title}"?</AlertDialogTitle>
                <AlertDialogDescription>This QR code will stop working. Existing orders are kept.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </Card>
  );
}