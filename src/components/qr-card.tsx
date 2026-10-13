import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Trash2, MoreVertical } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function QRCard({
  url, title, subtitle, onDelete,
}: {
  url: string; title: string; subtitle?: string; onDelete?: () => void;
}) {
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
    // h-full + mt-auto keep cards in a grid the same height, with the QR and buttons
    // lined up even when one subtitle wraps to two lines and another to one
    <Card className="p-4 flex flex-col items-center gap-3 bg-card h-full">
      <div className="text-sm font-medium">{title}</div>
      <div className="min-h-[2.5rem] flex items-center justify-center">
        {subtitle && <div className="text-xs text-muted-foreground text-center">{subtitle}</div>}
      </div>
      <div className="bg-white p-3 rounded-lg"><QRCodeSVG id={`qr-${title}`} value={url} size={160} /></div>
      <div className="mt-auto flex flex-col items-center gap-3 w-full">
      <div className="text-[10px] text-muted-foreground truncate max-w-full">{url}</div>
      <div className="flex justify-center gap-2 w-full">
        <Button size="sm" variant="outline" onClick={download} className="flex-1"><Download className="h-3 w-3 mr-1"/>Download</Button>
        {onDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="px-2"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                    <Trash2 className="h-3 w-3 mr-2" />Delete QR
                  </DropdownMenuItem>
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
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      </div>
    </Card>
  );
}