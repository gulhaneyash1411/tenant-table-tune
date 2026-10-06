import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Search, MoreHorizontal, Loader2, AlertTriangle, Plus, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ADMIN_PAGE_SIZE, Pager, StatusBadge, adminRpc, likeTerm, useDebounced } from "@/components/admin/admin-ui";
import { downloadQrPdf } from "@/lib/qr-pdf";

export const Route = createFileRoute("/_authenticated/admin/qr-codes")({ component: AdminQrCodes });

const sb = supabase as any;

type Org = { id: string; name: string };
type Outlet = { id: string; name: string; outlet_status: string | null };
type TableRow_ = { id: string; label: string; seats: number | null; is_active: boolean };
type Qr = { table_id: string; token: string; status: "ACTIVE" | "REVOKED" };

async function audit(row: Record<string, unknown>) {
  const { data } = await supabase.auth.getUser();
  const { error } = await sb.from("audit_logs").insert({ actor_id: data.user?.id ?? null, ...row });
  if (error) console.warn("audit insert failed", error.message);
}

/** Organization picker with search-as-you-type (max 100 results). */
function OrgSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [term, setTerm] = useState("");
  const dq = useDebounced(term);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [picked, setPicked] = useState<Org | null>(null);
  useEffect(() => {
    let live = true;
    let q = sb.from("organizations").select("id, name").order("name").limit(100);
    if (dq.trim()) q = q.ilike("name", `%${likeTerm(dq)}%`);
    q.then(({ data }: any) => { if (live) setOrgs(data ?? []); });
    return () => { live = false; };
  }, [dq]);
  const list = picked && !orgs.some((o) => o.id === picked.id) ? [picked, ...orgs] : orgs;
  return (
    <div className="space-y-1.5">
      <Input placeholder="Search organization…" value={term} onChange={(e) => setTerm(e.target.value)} />
      <Select value={value} onValueChange={(v) => { setPicked(list.find((o) => o.id === v) ?? null); onChange(v); }}>
        <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
        <SelectContent>{list.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

const qrUrl = (token: string) => `${window.location.origin}/order/${token}`;

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function downloadSvg(token: string, name: string) {
  const svg = renderToStaticMarkup(<QRCodeSVG value={qrUrl(token)} size={600} level="M" includeMargin />);
  saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
}

async function downloadPng(token: string, name: string) {
  const svg = renderToStaticMarkup(<QRCodeSVG value={qrUrl(token)} size={600} level="M" includeMargin />);
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("QR render failed")); img.src = objectUrl; });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 600, 600); ctx.drawImage(img, 0, 0, 600, 600);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (blob) saveBlob(blob, `${name}.png`);
  } finally { URL.revokeObjectURL(objectUrl); }
}

function AdminQrCodes() {
  const [orgId, setOrgId] = useState("");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");

  useEffect(() => {
    setOutletId(""); setOutlets([]);
    if (!orgId) return;
    let live = true;
    sb.from("tenants").select("id, name, outlet_status").eq("organization_id", orgId).order("name")
      .then(({ data, error }: any) => {
        if (!live) return;
        if (error) toast.error(error.message);
        setOutlets(data ?? []);
        if (data?.length === 1) setOutletId(data[0].id);
      });
    return () => { live = false; };
  }, [orgId]);

  const outlet = outlets.find((o) => o.id === outletId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tables & QR codes</h1>
        <p className="text-sm text-muted-foreground">Manage dining tables and their ordering QR codes per outlet.</p>
      </div>
      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <div><Label>Organization</Label><OrgSelect value={orgId} onChange={setOrgId} /></div>
        <div>
          <Label>Outlet</Label>
          <Select value={outletId} onValueChange={setOutletId} disabled={!orgId}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder={orgId ? "Select outlet" : "Pick an organization first"} /></SelectTrigger>
            <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Card>
      {outlet ? <OutletTables key={outlet.id} orgId={orgId} outlet={outlet} /> : (
        <Card className="p-10 text-center text-sm text-muted-foreground">Select an organization and outlet.</Card>
      )}
    </div>
  );
}

function OutletTables({ orgId, outlet }: { orgId: string; outlet: Outlet }) {
  const [rows, setRows] = useState<TableRow_[]>([]);
  const [qrs, setQrs] = useState<Record<string, Qr>>({});
  const [total, setTotal] = useState(0);
  const [activeQrs, setActiveQrs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [reload, setReload] = useState(0);

  const [editing, setEditing] = useState<TableRow_ | "new" | null>(null);
  const [form, setForm] = useState({ label: "", seats: "4", is_active: true });
  const [saving, setSaving] = useState(false);
  const [delFor, setDelFor] = useState<TableRow_ | null>(null);
  const [confirmQr, setConfirmQr] = useState<{ t: TableRow_; kind: "regen" | "revoke" } | null>(null);
  const [busyPdf, setBusyPdf] = useState(false);

  const outletActive = outlet.outlet_status === "ACTIVE";

  useEffect(() => { setPage(1); }, [dq]);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        let query = sb.from("restaurant_tables").select("id, label, seats, is_active", { count: "exact" })
          .eq("tenant_id", outlet.id).order("label")
          .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);
        if (dq.trim()) query = query.ilike("label", `%${likeTerm(dq)}%`);
        const { data, count, error: err } = await query;
        if (err) throw err;
        const list = (data ?? []) as TableRow_[];
        const map: Record<string, Qr> = {};
        if (list.length) {
          const { data: qd, error: qe } = await sb.from("qr_codes").select("table_id, token, status").in("table_id", list.map((t) => t.id));
          if (qe) throw qe;
          (qd ?? []).forEach((r: Qr) => { map[r.table_id] = r; });
        }
        const { count: ac } = await sb.from("qr_codes").select("id", { count: "exact", head: true }).eq("tenant_id", outlet.id).eq("status", "ACTIVE");
        if (!live) return;
        setRows(list); setTotal(count ?? 0); setQrs(map); setActiveQrs(ac ?? 0);
      } catch (e: any) {
        if (live) setError(e?.message ?? "Could not load tables");
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [outlet.id, page, dq, reload]);

  function openEdit(t: TableRow_ | "new") {
    setForm(t === "new" ? { label: "", seats: "4", is_active: true } : { label: t.label, seats: String(t.seats ?? ""), is_active: t.is_active });
    setEditing(t);
  }

  async function save() {
    const seats = Number(form.seats);
    if (!form.label.trim()) return toast.error("Label is required");
    if (!Number.isInteger(seats) || seats < 1) return toast.error("Seats must be a positive number");
    setSaving(true);
    const res = editing === "new"
      ? await sb.from("restaurant_tables").insert({ tenant_id: outlet.id, label: form.label.trim(), seats })
      : await sb.from("restaurant_tables").update({ label: form.label.trim(), seats, is_active: form.is_active }).eq("id", (editing as TableRow_).id);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing === "new" ? "Table added — QR created" : "Table updated");
    setEditing(null); setReload((n) => n + 1);
  }

  async function removeTable() {
    if (!delFor) return;
    const { error: err } = await sb.from("restaurant_tables").delete().eq("id", delFor.id);
    if (err) return toast.error(err.message);
    await audit({
      tenant_id: outlet.id, organization_id: orgId, action: "table.deleted", entity: "table", entity_id: delFor.id,
      old_value: { label: delFor.label },
    });
    setDelFor(null); toast.success("Table deleted"); setReload((n) => n + 1);
  }

  async function runQr(t: TableRow_, kind: "regen" | "revoke" | "enable") {
    try {
      if (kind === "regen") await adminRpc(sb, "regenerate_table_qr", { p_table_id: t.id });
      else await adminRpc(sb, "set_table_qr_status", { p_table_id: t.id, p_status: kind === "revoke" ? "REVOKED" : "ACTIVE" });
      await audit({
        tenant_id: outlet.id, organization_id: orgId,
        action: kind === "regen" ? "qr.regenerated" : kind === "revoke" ? "qr.revoked" : "qr.enabled",
        entity: "qr", entity_id: t.id,
      });
      toast.success(kind === "regen" ? "QR regenerated — the old link no longer works" : kind === "revoke" ? "QR disabled" : "QR enabled");
      setConfirmQr(null); setReload((n) => n + 1);
    } catch (e: any) { toast.error(e?.message ?? "QR action failed"); }
  }

  async function copyLink(token: string) {
    try { await navigator.clipboard.writeText(qrUrl(token)); toast.success("Link copied"); } catch { toast.error("Could not copy"); }
  }

  async function allPdf() {
    setBusyPdf(true);
    try {
      const [{ data: qd, error: e1 }, { data: td, error: e2 }] = await Promise.all([
        sb.from("qr_codes").select("table_id, token").eq("tenant_id", outlet.id).eq("status", "ACTIVE").limit(2000),
        sb.from("restaurant_tables").select("id, label, seats").eq("tenant_id", outlet.id).limit(2000),
      ]);
      if (e1 || e2) throw new Error((e1 || e2).message);
      const tmap = new Map<string, { label: string; seats: number | null }>((td ?? []).map((t: any) => [t.id, t]));
      const items = (qd ?? []).filter((r: any) => tmap.has(r.table_id)).map((r: any) => ({
        label: tmap.get(r.table_id)!.label, seats: tmap.get(r.table_id)!.seats, url: qrUrl(r.token),
      })).sort((a: any, b: any) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      if (items.length === 0) return toast.error("No active QR codes to download");
      await downloadQrPdf(items, `${outlet.name.replace(/\s+/g, "-")}-qr-codes.pdf`);
    } catch (e: any) { toast.error(e?.message ?? "PDF failed"); } finally { setBusyPdf(false); }
  }

  return (
    <div className="space-y-4">
      {!outletActive && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Outlet is not active</AlertTitle>
          <AlertDescription>QR codes of this outlet do not work until it is active (currently {outlet.outlet_status ?? "unknown"}).</AlertDescription>
        </Alert>
      )}
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search table label" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{total} tables</span><span>·</span><span>{activeQrs} active QRs</span><StatusBadge status={outlet.outlet_status} />
          </div>
          <Button variant="outline" onClick={allPdf} disabled={busyPdf}>
            {busyPdf ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}Download all QRs (PDF)
          </Button>
          <Button onClick={() => openEdit("new")}><Plus className="mr-1 h-4 w-4" />Add table</Button>
        </div>
        {error && <div className="flex items-center gap-2 rounded border border-destructive/40 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{error}</div>}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead><TableHead>Seats</TableHead><TableHead>Table status</TableHead>
                <TableHead>QR status</TableHead><TableHead>Token</TableHead><TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No tables for this outlet.</TableCell></TableRow>
              ) : rows.map((t) => {
                const qr = qrs[t.id];
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell>{t.seats ?? "—"}</TableCell>
                    <TableCell>{t.is_active ? <Badge variant="secondary" className="border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell>{qr ? (qr.status === "ACTIVE" ? <StatusBadge status="ACTIVE" /> : <Badge variant="secondary" className="border-0 bg-red-500/15 text-red-700 dark:text-red-400">Revoked</Badge>) : <span className="text-xs text-muted-foreground">No QR</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{qr ? `${qr.token.slice(0, 6)}…` : "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Actions for ${t.label}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(t)}>Edit table</DropdownMenuItem>
                          {qr && <DropdownMenuItem onClick={() => copyLink(qr.token)}>Copy link</DropdownMenuItem>}
                          {qr && <DropdownMenuItem onClick={() => downloadSvg(qr.token, `${t.label}-qr`)}>Download SVG</DropdownMenuItem>}
                          {qr && <DropdownMenuItem onClick={() => downloadPng(qr.token, `${t.label}-qr`).catch((e) => toast.error(e.message))}>Download PNG</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setConfirmQr({ t, kind: "regen" })}>Regenerate QR</DropdownMenuItem>
                          {qr?.status === "ACTIVE"
                            ? <DropdownMenuItem onClick={() => setConfirmQr({ t, kind: "revoke" })}>Disable QR</DropdownMenuItem>
                            : <DropdownMenuItem onClick={() => runQr(t, "enable")}>Enable QR</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDelFor(t)}>Delete table</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Pager page={page} total={total} onPage={setPage} />
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add table" : "Edit table"}</DialogTitle>
            <DialogDescription>{editing === "new" ? "A QR code is created automatically." : "Inactive tables cannot take orders."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
            <div><Label>Seats</Label><Input type="number" min="1" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></div>
            {editing !== "new" && (
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delFor} onOpenChange={(o) => !o && setDelFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete table {delFor?.label}?</AlertDialogTitle>
            <AlertDialogDescription>The table and its QR code are removed permanently; printed QR codes stop working.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeTable}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmQr} onOpenChange={(o) => !o && setConfirmQr(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmQr?.kind === "regen" ? "Regenerate QR?" : "Disable QR?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmQr?.kind === "regen"
                ? `A new link is issued for ${confirmQr?.t.label}. The printed QR code stops working.`
                : `Customers scanning ${confirmQr?.t.label} will no longer be able to order.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmQr && runQr(confirmQr.t, confirmQr.kind)}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
