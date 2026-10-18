import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentOutlet } from "@/lib/outlet-context";
import {
  getWhatsAppSettings,
  saveWhatsAppSettings,
  previewSegment,
  sendCampaign,
  sendTestMessage,
} from "@/lib/whatsapp.functions";
import { syncCampaignStatuses } from "@/lib/whatsapp.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { MessageCircle, Send, Users, CheckCheck, XCircle, Plus, Trash2, Eye, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/whatsapp")({ component: WhatsAppPage });

type Segment = {
  type: "all" | "frequent" | "inactive" | "range" | "birthday" | "anniversary" | "manual";
  min_visits?: number;
  inactive_days?: number;
  from?: string;
  to?: string;
};

const KINDS = [
  { v: "promo", l: "Promotion / offer" },
  { v: "festival", l: "Festival greeting" },
  { v: "birthday", l: "Birthday wish" },
  { v: "anniversary", l: "Anniversary wish" },
  { v: "new_menu", l: "New menu launch" },
  { v: "reengage", l: "Win-back / re-engage" },
];

const SEGMENTS = [
  { v: "all", l: "All customers" },
  { v: "frequent", l: "Frequent visitors" },
  { v: "inactive", l: "Inactive customers" },
  { v: "range", l: "Visited between dates" },
  { v: "birthday", l: "Birthdays today" },
  { v: "anniversary", l: "Anniversaries today" },
];

function WhatsAppPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            Send offers, festival wishes and win-back messages straight to your customers.
          </p>
        </div>
      </div>
      <Tabs defaultValue="compose">
      <div className="rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm mb-4">
        <b>Before you send:</b> the DineEatz sender is currently a WhatsApp <b>sandbox</b> number
        (+1 415 523 8886). A customer only receives messages after they send{" "}
        <code className="px-1 rounded bg-muted">join &lt;sandbox-code&gt;</code> to that number on WhatsApp.
        Numbers that haven't joined fail with "not joined the sandbox", and invalid numbers are skipped
        automatically. Moving the platform to an approved WhatsApp Business sender removes this limit.
      </div>
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4"><Compose /></TabsContent>
        <TabsContent value="campaigns" className="mt-4"><Campaigns /></TabsContent>
        <TabsContent value="templates" className="mt-4"><Templates /></TabsContent>
        <TabsContent value="settings" className="mt-4"><Settings /></TabsContent>
      </Tabs>
    </div>
  );
}

function useTenantId() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const data = await fetchCurrentOutlet<{ id: string }>(u.user.id, "id");
      setTenantId(data?.id ?? null);
    })();
  }, []);
  return tenantId;
}

function Compose() {
  const preview = useServerFn(previewSegment);
  const send = useServerFn(sendCampaign);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("promo");
  const [body, setBody] = useState("Hi {{name}}! 🍽️ ");
  const [media, setMedia] = useState("");
  const [seg, setSeg] = useState<Segment>({ type: "all" });
  const [schedule, setSchedule] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [sample, setSample] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTemplates(data ?? []));
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await preview({ data: { segment: seg } });
      setCount(r.count);
      setSample(r.sample);
    } catch {
      setCount(0);
      setSample([]);
    }
    setBusy(false);
  }, [preview, seg]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit() {
    if (!name.trim() || !body.trim()) return toast.error("Add a campaign name and message");
    setSending(true);
    try {
      const res = await send({
        data: {
          name: name.trim(),
          kind,
          body: body.trim(),
          media_url: media.trim() || null,
          segment: seg,
          scheduled_at: schedule ? new Date(schedule).toISOString() : null,
          origin: window.location.origin,
        },
      });
      if (res.scheduled) toast.success(`Scheduled for ${res.recipients} customers`);
       else if (res.failed > 0) {
         const detail = res.errors?.[0];
         toast.warning(`${res.sent} accepted, ${res.failed} failed${detail ? `: ${detail.message}` : ""}`, { duration: 9000 });
       } else toast.success(`Accepted by WhatsApp for ${res.sent} customers`);
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send campaign");
    }
    setSending(false);
  }

  const preview_text = useMemo(
    () => body.replace(/\{\{\s*name\s*\}\}/g, sample[0]?.name || "Aarav").replace(/\{\{\s*restaurant\s*\}\}/g, "your restaurant"),
    [body, sample],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5 space-y-4 lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Campaign name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali special 2026" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k.v} value={k.v}>{k.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {templates.length > 0 && (
          <div>
            <Label>Start from a template</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {templates.map((t) => (
                <button
                  key={String(t["id"])}
                  type="button"
                  onClick={() => {
                    setBody(String(t["body"]));
                    setMedia(String(t["media_url"] ?? ""));
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border hover:bg-accent/40"
                >
                  {String(t["name"])}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>Message</Label>
          <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">
            Use <code>{"{{name}}"}</code>, <code>{"{{restaurant}}"}</code> and <code>{"{{visits}}"}</code> to personalise.
          </p>
        </div>

        <div>
          <Label>Poster / image URL (optional)</Label>
          <Input value={media} onChange={(e) => setMedia(e.target.value)} placeholder="https://…/offer.jpg" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Audience</Label>
            <Select value={seg.type} onValueChange={(v) => setSeg({ type: v as Segment["type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SEGMENTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Schedule (optional)</Label>
            <Input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </div>
        </div>

        {seg.type === "frequent" && (
          <div>
            <Label>Minimum visits</Label>
            <Input
              type="number"
              min={1}
              value={seg.min_visits ?? 3}
              onChange={(e) => setSeg({ ...seg, min_visits: Number(e.target.value) })}
            />
          </div>
        )}
        {seg.type === "inactive" && (
          <div>
            <Label>Not seen for (days)</Label>
            <Input
              type="number"
              min={1}
              value={seg.inactive_days ?? 30}
              onChange={(e) => setSeg({ ...seg, inactive_days: Number(e.target.value) })}
            />
          </div>
        )}
        {seg.type === "range" && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>From</Label><Input type="date" value={seg.from ?? ""} onChange={(e) => setSeg({ ...seg, from: e.target.value })} /></div>
            <div><Label>To</Label><Input type="date" value={seg.to ?? ""} onChange={(e) => setSeg({ ...seg, to: e.target.value })} /></div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={submit} disabled={sending}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending…" : schedule ? "Schedule campaign" : "Send now"}
          </Button>
          <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
            <Eye className="h-4 w-4 mr-2" />Refresh audience
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />Audience
          </div>
          <div className="text-3xl font-semibold mt-1">{busy ? <Skeleton className="h-8 w-20" /> : (count ?? 0)}</div>
          <p className="text-xs text-muted-foreground">customers will receive this</p>
          <div className="mt-3 space-y-1">
            {sample.map((s) => (
              <div key={s.id} className="text-xs flex justify-between border-b py-1 last:border-0">
                <span className="truncate">{s.name}</span>
                <span className="text-muted-foreground">{s.phone}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground mb-2">Preview</div>
          <div className="rounded-xl bg-[hsl(var(--muted))] p-3 text-sm whitespace-pre-wrap">
            {media && <div className="mb-2 rounded-lg overflow-hidden"><img src={media} alt="Campaign poster" className="w-full object-cover" /></div>}
            {preview_text || "Your message appears here"}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Campaigns() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, unknown> | null>(null);
  const [msgs, setMsgs] = useState<Record<string, unknown>[]>([]);
  const [syncing, setSyncing] = useState(false);
  const sync = useServerFn(syncCampaignStatuses);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("whatsapp_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshStatuses() {
    setSyncing(true);
    try {
      const r = await sync({ data: undefined });
      await load();
      toast.success(`Checked ${r.checked} message${r.checked === 1 ? "" : "s"} with WhatsApp`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refresh delivery status");
    } finally {
      setSyncing(false);
    }
  }

  async function view(c: Record<string, unknown>) {
    setOpen(c);
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("campaign_id", String(c["id"]))
      .order("created_at", { ascending: false });
    setMsgs(data ?? []);
  }

  const totals = rows.reduce<{ sent: number; delivered: number; read: number; failed: number }>(
    (a, r) => ({
      sent: a.sent + Number(r["sent_count"] ?? 0),
      delivered: a.delivered + Number(r["delivered_count"] ?? 0),
      read: a.read + Number(r["read_count"] ?? 0),
      failed: a.failed + Number(r["failed_count"] ?? 0),
    }),
    { sent: 0, delivered: 0, read: 0, failed: 0 },
  );

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void refreshStatuses()} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Checking…" : "Refresh delivery status"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={<Send className="h-4 w-4" />} label="Sent" value={totals.sent} />
        <Stat icon={<CheckCheck className="h-4 w-4" />} label="Delivered" value={totals.delivered} />
        <Stat icon={<Eye className="h-4 w-4" />} label="Read" value={totals.read} />
        <Stat icon={<XCircle className="h-4 w-4" />} label="Failed" value={totals.failed} />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
              <TableHead>Recipients</TableHead><TableHead>Delivered</TableHead><TableHead>Read</TableHead>
              <TableHead>When</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No campaigns yet.</TableCell></TableRow>
            )}
            {rows.map((c) => (
              <TableRow key={String(c["id"])}>
                <TableCell className="font-medium">{String(c["name"])}</TableCell>
                <TableCell className="text-muted-foreground">{String(c["kind"])}</TableCell>
                <TableCell><Badge variant={c["status"] === "sent" ? "default" : c["status"] === "failed" ? "destructive" : "secondary"}>{String(c["status"])}</Badge></TableCell>
                <TableCell>{String(c["recipient_count"])}</TableCell>
                <TableCell>{String(c["delivered_count"])}</TableCell>
                <TableCell>{String(c["read_count"])}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {format(new Date(String(c["scheduled_at"] ?? c["created_at"])), "MMM d, HH:mm")}
                </TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => void view(c)}>Details</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{String(open?.["name"] ?? "")}</DialogTitle></DialogHeader>
          <div className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{String(open?.["body"] ?? "")}</div>
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {msgs.map((m) => (
                  <TableRow key={String(m["id"])}>
                    <TableCell>{String(m["to_name"] ?? "—")}</TableCell>
                    <TableCell className="text-muted-foreground">{String(m["to_phone"])}</TableCell>
                    <TableCell>
                      <Badge variant={["delivered", "read", "sent"].includes(String(m["status"])) ? "default" : "destructive"}>
                        {String(m["status"])}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

function Templates() {
  const tenantId = useTenantId();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [f, setF] = useState({ name: "", category: "promo", body: "", media_url: "" });

  const load = useCallback(() => {
    supabase
      .from("whatsapp_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, []);
  useEffect(load, [load]);

  async function add() {
    if (!tenantId) return toast.error("No restaurant on this account");
    if (!f.name.trim() || !f.body.trim()) return toast.error("Name and message are required");
    const { error } = await supabase.from("whatsapp_templates").insert({
      tenant_id: tenantId,
      name: f.name.trim(),
      category: f.category,
      body: f.body.trim(),
      media_url: f.media_url.trim() || null,
    });
    if (error) return toast.error(error.message);
    setF({ name: "", category: "promo", body: "", media_url: "" });
    toast.success("Template saved");
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5 space-y-3">
        <div className="font-medium">New template</div>
        <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div>
          <Label>Category</Label>
          <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map((k) => <SelectItem key={k.v} value={k.v}>{k.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Message</Label><Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div><Label>Image URL</Label><Input value={f.media_url} onChange={(e) => setF({ ...f, media_url: e.target.value })} /></div>
        <Button onClick={add}><Plus className="h-4 w-4 mr-2" />Save template</Button>
      </Card>
      <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2 content-start">
        {rows.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No templates yet.</Card>}
        {rows.map((t) => (
          <Card key={String(t["id"])} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{String(t["name"])}</div>
                <Badge variant="secondary" className="mt-1">{String(t["category"])}</Badge>
              </div>
              <Button size="icon" variant="ghost" onClick={() => void remove(String(t["id"]))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{String(t["body"])}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Settings() {
  const get = useServerFn(getWhatsAppSettings);
  const save = useServerFn(saveWhatsAppSettings);
  const test = useServerFn(sendTestMessage);
  const [loading, setLoading] = useState(true);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [s, setS] = useState({ is_active: false });
  const [testPhone, setTestPhone] = useState("");

  useEffect(() => {
    get({})
      .then((r) => {
        setPlatformAvailable(r.platformAvailable);
        if (r.settings) {
          setS({ is_active: !!r.settings.is_active });
        }
      })
      .finally(() => setLoading(false));
  }, [get]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5 space-y-4">
        <div className="font-medium">WhatsApp sender</div>
        <div className="rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Use the platform number</div>
            <p className="text-xs text-muted-foreground">
              {platformAvailable ? "Messages go out from the DineEatz WhatsApp business number." : "The platform number isn't configured yet."}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="text-sm font-medium">WhatsApp messaging enabled</div>
          <Switch checked={s.is_active} onCheckedChange={(v) => setS({ ...s, is_active: v })} />
        </div>

        <Button
          onClick={async () => {
            try {
              await save({ data: s });
              toast.success("Settings saved");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save");
            }
          }}
        >
          Save settings
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-medium">Send a test message</div>
        <p className="text-xs text-muted-foreground">
          The number must have opted in to your WhatsApp sender (or joined the Twilio sandbox).
        </p>
        <div><Label>Phone (with country code)</Label><Input type="tel" inputMode="numeric" maxLength={15} value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="919876543210" /></div>
        <Button
          variant="outline"
          onClick={async () => {
            const r = await test({ data: { phone: testPhone, body: "Hi {{name}}, this is a test from {{restaurant}} 👋" } });
            if (r.ok) toast.success(`Test sent via ${r.sender} sender`);
            else toast.error(r.error);
          }}
        >
          <Send className="h-4 w-4 mr-2" />Send test
        </Button>
      </Card>
    </div>
  );
}