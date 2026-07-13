import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/announcements")({ component: Announcements });

function Announcements() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<"all"|"pending"|"approved">("all");
  const [sent, setSent] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from("notifications").select("*").eq("kind", "announcement").order("created_at", { ascending: false }).limit(50);
    setSent(data || []);
  }
  useEffect(() => { load(); }, []);

  async function send() {
    if (!title.trim()) return toast.error("Title required");
    let q = supabase.from("tenants").select("id,owner_id");
    if (target !== "all") q = q.eq("status", target);
    const { data: tenants, error } = await q;
    if (error) return toast.error(error.message);
    const rows = (tenants || []).filter(t => t.owner_id).map(t => ({
      recipient_id: t.owner_id as string, tenant_id: t.id, title, body, kind: "announcement", channel: "dashboard" as const,
    }));
    if (rows.length === 0) return toast.error("No recipients");
    const { error: err } = await supabase.from("notifications").insert(rows);
    if (err) return toast.error(err.message);
    toast.success(`Sent to ${rows.length} restaurant(s)`);
    setTitle(""); setBody(""); load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Megaphone className="h-6 w-6"/><h1 className="text-2xl font-semibold">Announcements</h1></div>
      <Card className="p-5 space-y-3 max-w-2xl">
        <div><Label>Title</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Platform-wide announcement" /></div>
        <div><Label>Message</Label><Textarea value={body} onChange={e=>setBody(e.target.value)} rows={4} /></div>
        <div className="flex items-center gap-3"><Label>Audience</Label>
          <select className="border rounded px-2 py-1 text-sm bg-background" value={target} onChange={e=>setTarget(e.target.value as any)}>
            <option value="all">All restaurants</option>
            <option value="approved">Approved only</option>
            <option value="pending">Pending only</option>
          </select>
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
