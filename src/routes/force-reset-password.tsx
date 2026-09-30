import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LockKeyhole, Loader2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/force-reset-password")({ component: ForceResetPassword });

function ForceResetPassword() {
  const navigate = useNavigate();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw) return toast.error("Enter your current password");
    if (newPw.length < 6) return toast.error("New password must be at least 6 characters");
    if (newPw !== confirmPw) return toast.error("Passwords do not match");
    if (currentPw === newPw) return toast.error("New password must be different from current password");

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { toast.error("Session expired. Please sign in again."); setLoading(false); return; }

      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });
      if (verifyErr) { toast.error("Current password is incorrect"); setLoading(false); return; }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) { toast.error(updateErr.message); setLoading(false); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        await fetch("/api/clear-reset-flag", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      toast.success("Password updated successfully!");
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <Card className="w-full max-w-md p-8">
        <form onSubmit={submit} className="space-y-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10">
              <LockKeyhole className="h-7 w-7 text-warning" />
            </div>
            <h1 className="text-xl font-semibold">Reset Your Password</h1>
            <p className="text-sm text-muted-foreground max-w-xs">
              For security reasons, you must reset your password before continuing.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="current-pw">Current / temporary password</Label>
            <div className="relative">
              <Input
                id="current-pw"
                type={showCurrent ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                className="pr-10"
              />
              <button type="button" onClick={() => setShowCurrent((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New password</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
                placeholder="At least 6 characters"
                className="pr-10"
              />
              <button type="button" onClick={() => setShowNew((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirm new password</Label>
            <Input
              id="confirm-pw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</> : "Update Password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
