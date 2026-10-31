import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import { noindexHead } from "@/lib/seo";

export const Route = createFileRoute("/sales/login")({ head: noindexHead, component: SalesLogin });

// Deliberately separate from the Super Admin sign-in page (/admin/auth) —
// same pattern as Kitchen Users having their own /kitchen/login, different
// portal. Sales Users authenticate through ordinary Supabase Auth
// (signInWithPassword, same as everyone else), just via this dedicated page
// and with a role check afterwards instead of a shared login form.
function SalesLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/sales" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      return toast.error(error?.message || "Sign in failed");
    }

    // "sales_user" predates the generated Database types (added to the
    // app_role enum by a migration not yet reflected in types.ts), so it's
    // compared as a string rather than filtered in the query itself.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    setLoading(false);
    if (!roles?.some((r) => (r.role as string) === "sales_user")) {
      await supabase.auth.signOut();
      return toast.error("This isn't a sales account. Super admins, please use the admin sign-in.");
    }
    navigate({ to: "/sales" });
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/5 to-background p-6">
      <Card className="w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Sales sign in</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          For sales team only. Super admins sign in{" "}
          <Link to="/admin/auth" className="text-primary">
            here
          </Link>
          .
        </p>
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <div>
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoFocus
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Password</Label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="off"
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
