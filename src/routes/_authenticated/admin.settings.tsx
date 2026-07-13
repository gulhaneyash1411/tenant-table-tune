import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: PlatformSettings });

const KEYS = [
  { k: "brand_name", label: "Platform brand name" },
  { k: "support_email", label: "Support email" },
  { k: "support_phone", label: "Support phone" },
  { k: "default_currency", label: "Default currency" },
  { k: "trial_days", label: "Free trial (days)" },
  { k: "tos_url", label: "Terms of service URL" },
  { k: "privacy_url", label: "Privacy policy URL" },
];

function PlatformSettings() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [about, setAbout] = useState("");
  useEffect(() => {
    supabase.from("platform_settings").select("*").then(({ data }) => {
      const m: Record<string,string> = {};
      (data || []).forEach((r: any) => { if (r.key === "about") setAbout(r.value?.text || ""); else m[r.key] = r.value?.text || ""; });
      setVals(m);
    });
  }, []);
  async function save() {
    const rows = KEYS.map(k => ({ key: k.k, value: { text: vals[k.k] || "" } }));
    rows.push({ key: "about", value: { text: about } });
    const { error } = await supabase.from("platform_settings").upsert(rows, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Platform settings saved");
  }
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Platform settings</h1>
      <Card className="p-5 grid grid-cols-2 gap-3">
        {KEYS.map(k => <div key={k.k}><Label>{k.label}</Label><Input value={vals[k.k]||""} onChange={e=>setVals({...vals,[k.k]:e.target.value})}/></div>)}
        <div className="col-span-2"><Label>About the platform</Label><Textarea rows={4} value={about} onChange={e=>setAbout(e.target.value)}/></div>
      </Card>
      <Button onClick={save}>Save settings</Button>
    </div>
  );
}
