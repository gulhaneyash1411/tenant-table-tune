import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ChefHat } from "lucide-react";

export const Route = createFileRoute("/kitchen/login")({ component: KitchenLogin });

// Deliberately separate from the Hotel Owner sign-in page (/auth) and the
// super-admin one (/admin/auth) — same pattern, different portal. Kitchen
// Users authenticate through ordinary Supabase Auth (signInWithPassword,
// same as everyone else), just via this dedicated, minimal page and with a
// role check afterwards instead of a shared login form.
function KitchenLogin() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/kitchen" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // The "Login" the owner shares with kitchen staff is the exact
    // login_email generated for this account (shown/copyable from the
    // owner's Settings page) — entered verbatim, not reconstructed here.
    const { data, error } = await supabase.auth.signInWithPassword({
      email: login.trim(),
      password,
    });
    if (error || !data.user) {
      setLoading(false);
      return toast.error(error?.message || "Sign in failed");
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "kitchen");
    setLoading(false);
    if (!roles || roles.length === 0) {
      await supabase.auth.signOut();
      return toast.error(
        "This isn't a kitchen account. Hotel staff, please use the owner sign-in.",
      );
    }
    navigate({ to: "/kitchen" });
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/5 to-background p-6">
      <Card className="w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-2">
          <ChefHat className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Kitchen sign in</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          For kitchen staff only. Hotel owners sign in{" "}
          <Link to="/auth" className="text-primary">
            here
          </Link>
          .
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Login ID</Label>
            <Input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Given to you by your hotel owner"
              required
              autoFocus
            />
          </div>
          <div>
            <Label>Password</Label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
