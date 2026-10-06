import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName: string;
  isLoading?: boolean;
  impact?: {
    outletsCount?: number;
    totalOrders?: number;
    totalCustomers?: number;
    totalSubscriptions?: number;
    ordersCount?: number;
    customersCount?: number;
    subscriptionsCount?: number;
    invoicesCount?: number;
  };
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  isLoading = false,
  impact,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (confirmText !== "DELETE") {
      toast.error('Please type "DELETE" to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      await onConfirm();
      setConfirmText("");
      onOpenChange(false);
      toast.success("Successfully deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive mb-2">
                  This action cannot be undone. The following will be permanently deleted:
                </p>
                <ul className="text-sm text-destructive/80 space-y-1">
                  {impact?.outletsCount !== undefined && (
                    <li>• {impact.outletsCount} outlet(s)</li>
                  )}
                  {impact?.totalOrders !== undefined && (
                    <li>• {impact.totalOrders} order(s)</li>
                  )}
                  {impact?.ordersCount !== undefined && (
                    <li>• {impact.ordersCount} order(s)</li>
                  )}
                  {impact?.totalCustomers !== undefined && (
                    <li>• {impact.totalCustomers} customer(s)</li>
                  )}
                  {impact?.customersCount !== undefined && (
                    <li>• {impact.customersCount} customer(s)</li>
                  )}
                  {impact?.totalSubscriptions !== undefined && (
                    <li>• {impact.totalSubscriptions} subscription(s)</li>
                  )}
                  {impact?.subscriptionsCount !== undefined && (
                    <li>• {impact.subscriptionsCount} subscription(s)</li>
                  )}
                  {impact?.invoicesCount !== undefined && (
                    <li>• {impact.invoicesCount} invoice(s)</li>
                  )}
                </ul>
              </div>

              <div>
                <p className="text-sm mb-2">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm:
                </p>
                <Input
                  placeholder='Type "DELETE" to confirm'
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className={confirmText === "DELETE" ? "border-success" : ""}
                  disabled={isDeleting}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={confirmText !== "DELETE" || isDeleting || isLoading}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              `Delete ${itemName}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
