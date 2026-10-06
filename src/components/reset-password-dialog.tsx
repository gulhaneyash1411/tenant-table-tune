import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Modal for setting a new password on someone else's login (an outlet manager).
 * The caller does the actual request in `onSubmit`; a thrown Error is shown inline
 * and the dialog stays open, so the typed password isn't lost.
 */
export function ResetPasswordDialog({
  open, name, onClose, onSubmit,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setPw(""); setConfirm(""); setError(""); setBusy(false); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return setError("Password must be at least 6 characters");
    if (pw !== confirm) return setError("The two passwords don't match");
    setBusy(true);
    setError("");
    try {
      await onSubmit(pw);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the password");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {name}. Share it with them — it replaces their current one straight away.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="rp-new">New password</Label>
            <PasswordInput id="rp-new" required minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div>
            <Label htmlFor="rp-confirm">Confirm password</Label>
            <PasswordInput id="rp-confirm" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
