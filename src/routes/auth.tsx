import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Utensils } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex flex-col justify-between p-10 bg-gradient-to-br from-primary/10 via-accent/10 to-background border-r border-border">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center"><Utensils className="h-4 w-4"/></div>
          PlateOS
        </Link>
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Restaurant portal</h2>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Sign in to manage orders, tables, menus and staff. New restaurants are activated after super-admin approval.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">Are you the platform owner? <Link to="/admin/auth" className="text-primary">Super admin sign in →</Link></div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          {mode !== "forgot" && (
            <div className="flex gap-1 rounded-lg bg-muted p-1 mb-6">
              <button onClick={() => setMode("signin")} className={`flex-1 rounded-md py-2 text-sm ${mode==="signin"?"bg-background shadow":""}`}>Sign in</button>
              <button onClick={() => setMode("signup")} className={`flex-1 rounded-md py-2 text-sm ${mode==="signup"?"bg-background shadow":""}`}>Register restaurant</button>
            </div>
          )}
          {mode === "signin" && <SignInForm onForgot={() => setMode("forgot")} />}
          {mode === "signup" && <SignUpForm onDone={() => setMode("signin")} />}
          {mode === "forgot" && <ForgotForm onBack={() => setMode("signin")} />}
        </Card>
      </div>
    </div>
  );
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/app" });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><Label>Email</Label><Input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" required /></div>
      <div><Label>Password</Label><Input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" required /></div>
      <Button className="w-full" disabled={loading}>{loading?"Signing in…":"Sign in"}</Button>
      <button type="button" onClick={onForgot} className="w-full cursor-pointer text-sm text-primary hover:underline">Forgot password?</button>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success("Reset link sent — check your inbox");
  }
  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">We sent a password reset link to <b>{email}</b>. Open it to set a new password.</p>
        <Button variant="outline" className="w-full cursor-pointer" onClick={onBack}>Back to sign in</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>Email</Label>
        <Input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" required placeholder="you@restaurant.com" />
      </div>
      <Button className="w-full" disabled={loading}>{loading?"Sending…":"Send reset link"}</Button>
      <button type="button" onClick={onBack} className="w-full cursor-pointer text-sm text-muted-foreground hover:underline">Back to sign in</button>
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ email: "", password: "", full_name: "", phone: "", restaurant: "", city: "", state: "", pincode: "", gst: "", tables: 10 });
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email, password: f.password,
      options: { data: { full_name: f.full_name, phone: f.phone } },
    });
    if (error || !data.user) { setLoading(false); return toast.error(error?.message || "Sign up failed"); }
    // sign in so RLS insert works
    await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
    const slug = f.restaurant.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).slice(2,6);
    const { error: tErr } = await supabase.from("tenants").insert({
      name: f.restaurant, slug, owner_id: data.user.id, owner_name: f.full_name, owner_email: f.email, owner_phone: f.phone,
      gst_number: f.gst, city: f.city, state: f.state, pincode: f.pincode, number_of_tables: f.tables, status: "pending",
    });
    setLoading(false);
    if (tErr) return toast.error(tErr.message);
    toast.success("Registered! Super admin will review shortly.");
    onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Owner name</Label><Input required value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})}/></div>
        <div><Label>Phone</Label><Input required value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></div>
      </div>
      <div><Label>Email</Label><Input required type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div>
      <div><Label>Password</Label><Input required type="password" value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></div>
      <div><Label>Restaurant name</Label><Input required value={f.restaurant} onChange={e=>setF({...f,restaurant:e.target.value})}/></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>City</Label><Input value={f.city} onChange={e=>setF({...f,city:e.target.value})}/></div>
        <div><Label>State</Label><Input value={f.state} onChange={e=>setF({...f,state:e.target.value})}/></div>
        <div><Label>Pincode</Label><Input value={f.pincode} onChange={e=>setF({...f,pincode:e.target.value})}/></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>GST</Label><Input value={f.gst} onChange={e=>setF({...f,gst:e.target.value})}/></div>
        <div><Label>Tables</Label><Input type="number" value={f.tables} onChange={e=>setF({...f,tables:Number(e.target.value)})}/></div>
      </div>
      <Button className="w-full" disabled={loading}>{loading?"Creating…":"Register restaurant"}</Button>
      <p className="text-xs text-muted-foreground text-center">You'll be able to sign in once the super admin approves your restaurant.</p>
    </form>
  );
}