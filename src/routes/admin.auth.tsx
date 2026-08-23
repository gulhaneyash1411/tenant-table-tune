import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin/auth")({ component: AdminAuth });

function AdminAuth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
  }, [navigate]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error || !data.user) return toast.error(error?.message || "Sign in failed");
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "super_admin");
    if (!roles || roles.length === 0) {
      await supabase.auth.signOut();
      return toast.error("This account is not a super admin.");
    }
    navigate({ to: "/admin" });
  }
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/5 to-background p-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-2"><ShieldCheck className="h-5 w-5 text-primary" /><h1 className="text-xl font-semibold">Super admin</h1></div>
        <p className="text-sm text-muted-foreground mb-6">Platform-owner portal. Restaurants sign in <Link to="/auth" className="text-primary">here</Link>.</p>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Email</Label><Input value={email} onChange={e=>setEmail(e.target.value)} type="email" required /></div>
          <div><Label>Password</Label><PasswordInput value={password} onChange={e=>setPassword(e.target.value)} required /></div>
          <Button className="w-full" disabled={loading}>{loading?"Signing in…":"Sign in"}</Button>
        </form>
      </Card>
    </div>
  );
}