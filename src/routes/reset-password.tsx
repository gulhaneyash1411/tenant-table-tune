import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password — PlateOS restaurant portal" },
      { name: "description", content: "Set a new password for your PlateOS restaurant owner account." },
      { property: "og:title", content: "Reset password — PlateOS" },
      { property: "og:description", content: "Set a new password for your PlateOS restaurant owner account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/app" });
  }

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <Card className="w-full max-w-md p-8 space-y-4">
        <h1 className="text-xl font-semibold">Set a new password</h1>
        {!ready ? (
          <p className="text-sm text-muted-foreground">
            Open this page from the reset link in your email. <Link to="/auth" className="text-primary cursor-pointer">Back to sign in</Link>
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div><Label>New password</Label><Input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></div>
            <div><Label>Confirm password</Label><Input type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required /></div>
            <Button className="w-full" disabled={loading}>{loading ? "Updating…" : "Update password"}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}