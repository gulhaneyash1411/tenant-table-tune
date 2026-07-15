import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/announcements")({ component: Announcements });

function Announcements() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  async function load() {
    const [{ data: n }, { data: t }] = await Promise.all([
      supabase.from("notifications").select("*").eq("kind", "announcement").order("created_at", { ascending: false }).limit(50),
      supabase.from("tenants").select("id,name,status,owner_id,city").order("name"),
    ]);
    setSent(n || []);
    setTenants(t || []);
  }
  useEffect(() => { load(); }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  const filtered = tenants.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  const allSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id));

  async function send() {
    if (!title.trim()) return toast.error("Title required");
    if (selected.size === 0) return toast.error("Select at least one restaurant");
    const picked = tenants.filter(t => selected.has(t.id) && t.owner_id);
    const rows = picked.map(t => ({
      recipient_id: t.owner_id as string, tenant_id: t.id, title, body, kind: "announcement", channel: "dashboard" as const,
    }));
    if (rows.length === 0) return toast.error("No recipients");
    const { error: err } = await supabase.from("notifications").insert(rows);
    if (err) return toast.error(err.message);
    toast.success(`Sent to ${rows.length} restaurant(s)`);
    setTitle(""); setBody(""); setSelected(new Set()); load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Megaphone className="h-6 w-6"/><h1 className="text-2xl font-semibold">Announcements</h1></div>
      <Card className="p-5 space-y-3 max-w-2xl">
        <div><Label>Title</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Platform-wide announcement" /></div>
        <div><Label>Message</Label><Textarea value={body} onChange={e=>setBody(e.target.value)} rows={4} /></div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Audience ({selected.size} selected)</Label>
            <Input placeholder="Search restaurants…" value={q} onChange={e=>setQ(e.target.value)} className="max-w-xs h-8" />
          </div>
          <div className="border rounded-md max-h-64 overflow-auto divide-y">
            <label className="flex items-center gap-3 p-2 bg-muted/40 cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={(v) => {
                const next = new Set(selected);
                if (v) filtered.forEach(t => next.add(t.id));
                else filtered.forEach(t => next.delete(t.id));
                setSelected(next);
              }} />
              <span className="text-sm font-medium">Select all {q ? "(filtered)" : ""}</span>
            </label>
            {filtered.map(t => (
              <label key={t.id} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-accent/40">
                <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.city || "—"} · {t.status}</div>
                </div>
              </label>
            ))}
            {filtered.length === 0 && <div className="p-3 text-sm text-muted-foreground">No restaurants match.</div>}
          </div>
          <Button onClick={send}>Send announcement</Button>
        </div>
      </Card>
      <div className="space-y-2">
        <div className="font-medium text-sm">Recent announcements</div>
        {sent.map(s => (
          <Card key={s.id} className="p-3">
            <div className="flex justify-between"><div className="font-medium text-sm">{s.title}</div><div className="text-xs text-muted-foreground">{format(new Date(s.created_at), "PPp")}</div></div>
            {s.body && <div className="text-sm text-muted-foreground mt-1">{s.body}</div>}
          </Card>
        ))}
        {sent.length===0 && <div className="text-sm text-muted-foreground">No announcements sent yet.</div>}
      </div>
    </div>
  );
}
