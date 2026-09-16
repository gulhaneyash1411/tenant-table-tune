import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { UsersRound, Wallet, Plus, Trash2, Search, ChevronLeft, ChevronRight, X, Download, FileDown, CalendarCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/staff")({ component: StaffPage });

const PAGE_SIZE = 10;
const today = () => new Date().toISOString().slice(0, 10);

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "netbanking", label: "Net banking" },
  { value: "bank_transfer", label: "Bank transfer (NEFT/IMPS)" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];
const modeLabel = (v?: string) => PAYMENT_MODES.find((m) => m.value === v)?.label ?? "—";

/* ---------- Salary / absence helpers ---------- */
const thisMonth = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"
// Actual days in the month: handles 28/29 (leap year), 30 and 31
const daysInMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function calcSalary(monthly: number, ym: string, absent: number) {
  const days = daysInMonth(ym);
  const perDay = monthly / days;
  const safeAbsent = Math.min(Math.max(0, absent || 0), days);
  const deduction = round2(perDay * safeAbsent);
  return { days, perDay: round2(perDay), deduction, net: round2(monthly - deduction) };
}

const newPayForm = (monthly = 0) => ({
  amount: monthly,
  paid_on: today(),
  payment_mode: "cash",
  notes: "",
  salary_month: thisMonth(),
  deduct: false,
  absent_days: 0,
});

/* =====================================================================
   Salary slip PDF — built in the browser, no packages required
   ===================================================================== */
type RGB = [number, number, number];
const PT = 72 / 25.4; // mm -> pt
const PAGE_W = 210;
const PAGE_H = 297;
const DARK: RGB = [0.08, 0.08, 0.08];
const GREY: RGB = [0.45, 0.45, 0.45];

let measureCtx: CanvasRenderingContext2D | null = null;
// Text width in mm (Arial metrics match Helvetica)
function textWidth(s: string, size: number, bold = false) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return (s.length * size * 0.5) / PT;
  measureCtx.font = `${bold ? "bold " : ""}100px Helvetica, Arial, sans-serif`;
  return ((measureCtx.measureText(s).width / 100) * size) / PT;
}

function createPdf() {
  const pages: string[][] = [];
  let cur: string[] = [];
  const f = (v: number) => v.toFixed(2);
  const esc = (s: string) => s.replace(/[^\x20-\x7E]/g, "").replace(/([\\()])/g, "\\$1");

  const pdf = {
    addPage() {
      cur = [];
      pages.push(cur);
    },
    text(s: string, x: number, y: number, o: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; color?: RGB } = {}) {
      const size = o.size ?? 9;
      const w = textWidth(s, size, o.bold);
      const xx = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
      const [r, g, b] = o.color ?? DARK;
      cur.push(`BT /${o.bold ? "F2" : "F1"} ${size} Tf ${r} ${g} ${b} rg ${f(xx * PT)} ${f((PAGE_H - y) * PT)} Td (${esc(s)}) Tj ET`);
    },
    wrap(s: string, size: number, maxW: number) {
      const lines: string[] = [];
      let line = "";
      s.split(/\s+/).forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (textWidth(test, size) > maxW && line) {
          lines.push(line);
          line = word;
        } else line = test;
      });
      if (line) lines.push(line);
      return lines;
    },
    line(x1: number, y1: number, x2: number, y2: number, w = 0.2) {
      cur.push(`${f(w * PT)} w 0 0 0 RG ${f(x1 * PT)} ${f((PAGE_H - y1) * PT)} m ${f(x2 * PT)} ${f((PAGE_H - y2) * PT)} l S`);
    },
    rect(x: number, y: number, w: number, h: number, fill?: RGB) {
      const box = `${f(x * PT)} ${f((PAGE_H - y - h) * PT)} ${f(w * PT)} ${f(h * PT)} re`;
      cur.push(fill ? `${fill.join(" ")} rg ${box} f` : `${f(0.2 * PT)} w 0 0 0 RG ${box} S`);
    },
    save(fileName: string) {
      const objs: string[] = [
        `<< /Type /Catalog /Pages 2 0 R >>`,
        `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
        `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
        `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
      ];
      pages.forEach((ops, i) => {
        const stream = ops.join("\n");
        objs.push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PAGE_W * PT)} ${f(PAGE_H * PT)}] ` +
            `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
        );
        objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      });
      let out = "%PDF-1.4\n";
      const offsets: number[] = [];
      objs.forEach((o, i) => {
        offsets.push(out.length);
        out += `${i + 1} 0 obj\n${o}\nendobj\n`;
      });
      const xref = out.length;
      out +=
        `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
        offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
        `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

      const url = URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
  pdf.addPage();
  return pdf;
}

// Built-in PDF fonts have no ₹ glyph, so slips use "Rs."
const rs = (n: number) => "Rs. " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const fileSafe = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim());
const three = (n: number) =>
  [Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} Hundred` : "", n % 100 ? two(n % 100) : ""].filter(Boolean).join(" ");

// Indian numbering: lakh / crore
function amountInWords(amount: number) {
  let n = Math.floor(amount);
  const paise = Math.round((amount - n) * 100);
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thou = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thou) parts.push(`${two(thou)} Thousand`);
  if (n) parts.push(three(n));
  let words = parts.length ? `${parts.join(" ")} Rupees` : "";
  if (paise) words += `${words ? " and " : ""}${two(paise)} Paise`;
  return (words || "Zero Rupees") + " Only";
}

type Biz = { name: string; address?: string; phone?: string };

function drawSlip(pdf: ReturnType<typeof createPdf>, biz: Biz, staff: any, p: any) {
  const M = 15;
  const W = PAGE_W;
  const TW = W - 2 * M;
  let y = 20;

  const monthDate = new Date(p.salary_month || p.paid_on);
  const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const net = Number(p.amount || 0);
  const deduction = Number(p.deduction_amount || 0);
  const gross = Number(p.gross_amount ?? net + deduction);
  const absent = Number(p.absent_days || 0);
  const perDay = gross / days;

  // Header
  pdf.text(biz.name || "Salary Slip", W / 2, y, { size: 16, bold: true, align: "center" });
  y += 6;
  const sub = [biz.address, biz.phone].filter(Boolean).join("  |  ");
  if (sub) {
    pdf.text(sub, W / 2, y, { align: "center", color: GREY });
    y += 5;
  }
  pdf.text(`Salary Slip for ${format(monthDate, "MMMM yyyy")}`, W / 2, y + 3, { size: 12, bold: true, align: "center" });
  y += 8;
  pdf.line(M, y, W - M, y, 0.4);
  y += 8;

  // Details
  const kv = (label: string, value: string, x: number) => {
    pdf.text(label, x, y, { color: GREY });
    pdf.text(value || "-", x + 32, y, { bold: true });
  };
  const R = W / 2 + 5;
  kv("Employee", staff.name, M);
  kv("Slip no.", String(p.id).slice(0, 8).toUpperCase(), R);
  y += 6;
  kv("Designation", titleCase(staff.role || ""), M);
  kv("Paid on", format(new Date(p.paid_on), "dd MMM yyyy"), R);
  y += 6;
  kv("Phone", staff.phone || "-", M);
  kv("Payment mode", modeLabel(p.payment_mode), R);
  y += 6;
  kv("Date of joining", staff.join_date ? format(new Date(staff.join_date), "dd MMM yyyy") : "-", M);
  kv("Days in month", String(days), R);
  y += 10;

  // Earnings / deductions table
  const H = 8;
  const C = TW / 2;
  const top = y;
  pdf.rect(M, y, TW, H, [0.94, 0.94, 0.94]);
  pdf.text("Earnings", M + 3, y + 5.5, { size: 10, bold: true });
  pdf.text("Amount", M + C - 3, y + 5.5, { size: 10, bold: true, align: "right" });
  pdf.text("Deductions", M + C + 3, y + 5.5, { size: 10, bold: true });
  pdf.text("Amount", M + TW - 3, y + 5.5, { size: 10, bold: true, align: "right" });
  y += H;

  pdf.text("Monthly salary", M + 3, y + 5.5);
  pdf.text(rs(gross), M + C - 3, y + 5.5, { align: "right" });
  pdf.text(absent ? `Absent days (${absent} x ${rs(perDay)})` : "Absent days", M + C + 3, y + 5.5);
  pdf.text(rs(deduction), M + TW - 3, y + 5.5, { align: "right" });
  y += H;

  pdf.line(M, y, M + TW, y);
  pdf.text("Gross earnings", M + 3, y + 5.5, { bold: true });
  pdf.text(rs(gross), M + C - 3, y + 5.5, { bold: true, align: "right" });
  pdf.text("Total deductions", M + C + 3, y + 5.5, { bold: true });
  pdf.text(rs(deduction), M + TW - 3, y + 5.5, { bold: true, align: "right" });
  y += H;
  pdf.rect(M, top, TW, y - top);
  pdf.line(M + C, top, M + C, y);
  y += 6;

  // Net pay
  pdf.rect(M, y, TW, 12, [0.91, 0.96, 0.93]);
  pdf.text("Net pay", M + 3, y + 7.8, { size: 11, bold: true });
  pdf.text(rs(net), W - M - 3, y + 8, { size: 13, bold: true, align: "right" });
  y += 19;

  pdf.wrap(`Amount in words: ${amountInWords(net)}`, 9, TW).forEach((l) => {
    pdf.text(l, M, y);
    y += 5;
  });
  if (p.notes) {
    y += 2;
    pdf.wrap(`Notes: ${p.notes}`, 9, TW).forEach((l) => {
      pdf.text(l, M, y);
      y += 5;
    });
  }

  // Signatures
  y += 25;
  pdf.line(M, y, M + 55, y);
  pdf.line(W - M - 55, y, W - M, y);
  pdf.text("Employee signature", M, y + 5);
  pdf.text("Authorised signatory", W - M, y + 5, { align: "right" });

  pdf.text("This is a computer-generated salary slip.", W / 2, PAGE_H - 10, { size: 8, align: "center", color: GREY });
}

function downloadSalarySlip(biz: Biz, staff: any, p: any) {
  const pdf = createPdf();
  drawSlip(pdf, biz, staff, p);
  pdf.save(`Salary_Slip_${fileSafe(staff.name)}_${format(new Date(p.salary_month || p.paid_on), "MMM_yyyy")}.pdf`);
}

function downloadSalarySlips(biz: Biz, items: { staff: any; payment: any }[], fileName: string) {
  const pdf = createPdf();
  items.forEach(({ staff, payment }, i) => {
    if (i > 0) pdf.addPage();
    drawSlip(pdf, biz, staff, payment);
  });
  pdf.save(fileName);
}

/* ---------- Pagination ---------- */
function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total === 0) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-1">
          {page} / {pages}
        </span>
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 pl-8" />
    </div>
  );
}

/* =====================================================================
   Attendance
   ===================================================================== */
type AttStatus = "present" | "absent" | "half_day" | "leave";
const ATT: Record<AttStatus, { short: string; label: string; cls: string }> = {
  present: { short: "P", label: "Present", cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" },
  absent: { short: "A", label: "Absent", cls: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300" },
  half_day: { short: "H", label: "Half day", cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300" },
  leave: { short: "L", label: "Paid leave", cls: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300" },
};
const ATT_ORDER: (AttStatus | undefined)[] = [undefined, "present", "absent", "half_day", "leave"];
const monthBounds = (ym: string) => ({ start: `${ym}-01`, end: `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}` });
// Absent = 1 day, half day = 0.5 day. Paid leave and unmarked days are not deducted.
const deductibleDays = (c: { absent: number; half_day: number }) => c.absent + c.half_day * 0.5;

function AttendanceDialog({
  open,
  onOpenChange,
  tenantId,
  staff,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  staff: any[];
}) {
  const [tab, setTab] = useState<"daily" | "monthly">("daily");
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, AttStatus>>({});
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(thisMonth());
  const [monthRows, setMonthRows] = useState<any[]>([]);

  const active = staff.filter((s) => (s.status ?? "active") === "active");
  const table = (supabase as any).from.bind(supabase);

  // Daily: load marks for the selected date
  useEffect(() => {
    if (!open || tab !== "daily" || !tenantId) return;
    table("staff_attendance")
      .select("staff_id,status")
      .eq("tenant_id", tenantId)
      .eq("attendance_date", date)
      .then(({ data, error }: any) => {
        if (error) return toast.error(error.message);
        setMarks(Object.fromEntries((data || []).map((r: any) => [r.staff_id, r.status])));
      });
  }, [open, tab, date, tenantId]);

  async function loadMonth() {
    const { start, end } = monthBounds(month);
    const { data, error } = await table("staff_attendance")
      .select("staff_id,attendance_date,status")
      .eq("tenant_id", tenantId)
      .gte("attendance_date", start)
      .lte("attendance_date", end);
    if (error) return toast.error(error.message);
    setMonthRows(data || []);
  }
  useEffect(() => {
    if (open && tab === "monthly" && tenantId) loadMonth();
  }, [open, tab, month, tenantId]);

  const monthMap = useMemo(() => {
    const m: Record<string, Record<number, AttStatus>> = {};
    monthRows.forEach((r) => {
      (m[r.staff_id] ??= {})[Number(r.attendance_date.slice(8, 10))] = r.status;
    });
    return m;
  }, [monthRows]);

  async function saveDay() {
    const rows = Object.entries(marks).map(([staff_id, status]) => ({ tenant_id: tenantId, staff_id, attendance_date: date, status }));
    if (!rows.length) return toast.error("Mark at least one staff member");
    setSaving(true);
    const { error } = await table("staff_attendance").upsert(rows, { onConflict: "staff_id,attendance_date" });
    setSaving(false);
    if (error) return toast.error(error.message);
    const unmarked = active.length - rows.length;
    toast.success(`Attendance saved for ${format(new Date(date), "dd MMM yyyy")}${unmarked > 0 ? ` · ${unmarked} unmarked` : ""}`);
  }

  // Monthly grid: click a cell to cycle P → A → H → L → clear
  async function cycleCell(staffId: string, day: number) {
    const d = `${month}-${String(day).padStart(2, "0")}`;
    if (d > today()) return;
    const curr = monthMap[staffId]?.[day];
    const next = ATT_ORDER[(ATT_ORDER.indexOf(curr) + 1) % ATT_ORDER.length];
    const { error } = next
      ? await table("staff_attendance").upsert(
          { tenant_id: tenantId, staff_id: staffId, attendance_date: d, status: next },
          { onConflict: "staff_id,attendance_date" },
        )
      : await table("staff_attendance").delete().eq("staff_id", staffId).eq("attendance_date", d);
    if (error) return toast.error(error.message);
    loadMonth();
  }

  const days = daysInMonth(month);
  const dayNums = Array.from({ length: days }, (_, i) => i + 1);
  const markedCount = Object.keys(marks).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Staff attendance</DialogTitle>
        </DialogHeader>

        <div className="inline-flex w-fit rounded-md border p-0.5 text-sm">
          {(["daily", "monthly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "daily" ? "Mark attendance" : "Monthly register"}
            </button>
          ))}
        </div>

        {tab === "daily" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <Label>Date</Label>
                <Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value || today())} className="h-8 w-44" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setMarks(Object.fromEntries(active.map((s) => [s.id, "present" as AttStatus])))}>
                  Mark all present
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMarks({})}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="divide-y rounded-md border">
              {active.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs capitalize text-muted-foreground">{s.role}</div>
                  </div>
                  <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                    {(Object.keys(ATT) as AttStatus[]).map((k) => {
                      const on = marks[s.id] === k;
                      return (
                        <button
                          key={k}
                          role="radio"
                          aria-checked={on}
                          onClick={() => setMarks({ ...marks, [s.id]: k })}
                          className={`rounded border px-2 py-1 text-xs ${on ? ATT[k].cls + " font-semibold" : "border-input text-muted-foreground hover:bg-muted"}`}
                        >
                          {ATT[k].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {active.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No active staff</div>}
            </div>

            <DialogFooter className="items-center gap-2 sm:justify-between">
              <span className="text-xs text-muted-foreground">
                {markedCount} of {active.length} marked
              </span>
              <Button onClick={saveDay} disabled={saving || !markedCount}>
                {saving ? "Saving…" : "Save attendance"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <Label>Month</Label>
                <Input type="month" max={thisMonth()} value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} className="h-8 w-44" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {(Object.keys(ATT) as AttStatus[]).map((k) => (
                  <span key={k} className={`rounded border px-1.5 py-0.5 ${ATT[k].cls}`}>
                    {ATT[k].short} = {ATT[k].label}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Click a day to change it. Absent = 1 day and half day = 0.5 day deductible.</p>

            <div className="overflow-x-auto rounded-md border">
              <table className="text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[140px] bg-muted p-2 text-left">Staff</th>
                    {dayNums.map((d) => {
                      const dow = new Date(`${month}-${String(d).padStart(2, "0")}`).getDay();
                      return (
                        <th key={d} className={`w-7 p-1 text-center font-medium ${dow === 0 ? "text-red-500" : ""}`}>
                          {d}
                        </th>
                      );
                    })}
                    {(["P", "A", "H", "L"] as const).map((h) => (
                      <th key={h} className="w-8 p-1 text-center">{h}</th>
                    ))}
                    <th className="p-1 px-2 text-center">Deduct</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((s) => {
                    const row = monthMap[s.id] || {};
                    const c = { present: 0, absent: 0, half_day: 0, leave: 0 };
                    Object.values(row).forEach((v) => c[v]++);
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="sticky left-0 z-10 bg-background p-2 font-medium">{s.name}</td>
                        {dayNums.map((d) => {
                          const st = row[d];
                          const future = `${month}-${String(d).padStart(2, "0")}` > today();
                          return (
                            <td key={d} className="p-0.5 text-center">
                              <button
                                disabled={future}
                                onClick={() => cycleCell(s.id, d)}
                                aria-label={`${s.name}, day ${d}: ${st ? ATT[st].label : "not marked"}`}
                                className={`h-6 w-6 rounded border text-[10px] ${
                                  st ? ATT[st].cls : "border-dashed border-muted-foreground/30 text-muted-foreground"
                                } ${future ? "cursor-not-allowed opacity-30" : "hover:ring-1 hover:ring-primary"}`}
                              >
                                {st ? ATT[st].short : ""}
                              </button>
                            </td>
                          );
                        })}
                        <td className="text-center">{c.present}</td>
                        <td className="text-center text-red-600">{c.absent}</td>
                        <td className="text-center text-amber-600">{c.half_day}</td>
                        <td className="text-center text-sky-600">{c.leave}</td>
                        <td className="px-2 text-center font-semibold">{deductibleDays(c)}</td>
                      </tr>
                    );
                  })}
                  {active.length === 0 && (
                    <tr>
                      <td colSpan={days + 6} className="p-4 text-center text-muted-foreground">No active staff</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StaffPage() {
  const [tenantId, setTenantId] = useState<string>("");
  const [business, setBusiness] = useState<{ name: string; address?: string; phone?: string }>({ name: "" });
  const [staff, setStaff] = useState<any[]>([]);
  const [pays, setPays] = useState<any[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [openPay, setOpenPay] = useState<any>(null);
  const [f, setF] = useState<any>({ name: "", role: "waiter", phone: "", monthly_salary: 0, join_date: today() });
  const [payForm, setPayForm] = useState<any>(newPayForm());
  const [openAttendance, setOpenAttendance] = useState(false);

  // Attendance summary for the staff member + month being paid
  const [payAtt, setPayAtt] = useState<null | { present: number; absent: number; half_day: number; leave: number; marked: number; deductible: number }>(null);
  const [payAttDismissed, setPayAttDismissed] = useState(false);
  useEffect(() => {
    setPayAtt(null);
    setPayAttDismissed(false);
    if (!openPay || !payForm.salary_month) return;
    const { start, end } = monthBounds(payForm.salary_month);
    (supabase as any)
      .from("staff_attendance")
      .select("status")
      .eq("staff_id", openPay.id)
      .gte("attendance_date", start)
      .lte("attendance_date", end)
      .then(({ data, error }: any) => {
        if (error) return toast.error(error.message);
        const c = { present: 0, absent: 0, half_day: 0, leave: 0 };
        (data || []).forEach((r: any) => c[r.status as AttStatus]++);
        setPayAtt({ ...c, marked: (data || []).length, deductible: deductibleDays(c) });
      });
  }, [openPay?.id, payForm.salary_month]);

  // Live calculation for the pay dialog
  const monthlySalary = Number(openPay?.monthly_salary || 0);
  const calc = calcSalary(monthlySalary, payForm.salary_month || thisMonth(), Number(payForm.absent_days));

  // Keep amount in sync with deduction while it's enabled
  useEffect(() => {
    if (openPay && payForm.deduct) setPayForm((pf: any) => ({ ...pf, amount: calc.net }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payForm.deduct, payForm.absent_days, payForm.salary_month, openPay]);

  // Staff filters
  const [staffQ, setStaffQ] = useState("");
  const [staffRole, setStaffRole] = useState("all");
  const [staffStatus, setStaffStatus] = useState("all");
  const [staffPage, setStaffPage] = useState(1);

  // Payment filters
  const [payQ, setPayQ] = useState("");
  const [payMode, setPayMode] = useState("all");
  const [payStaff, setPayStaff] = useState("all");
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");
  const [payPage, setPayPage] = useState(1);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await (supabase as any).from("tenants").select("*").eq("owner_id", u.user!.id).maybeSingle();
    if (!t) return;
    setTenantId(t.id);
    setBusiness({
      name: t.name || t.business_name || t.hotel_name || "",
      address: t.address || "",
      phone: t.phone || "",
    });
    const [{ data: s }, { data: p }] = await Promise.all([
      (supabase as any).from("staff_members").select("*").eq("tenant_id", t.id).order("created_at", { ascending: false }),
      (supabase as any).from("salary_payments").select("*").eq("tenant_id", t.id).order("paid_on", { ascending: false }).limit(1000),
    ]);
    setStaff(s || []);
    setPays(p || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!f.name.trim()) return toast.error("Name required");
    const { error } = await (supabase as any)
      .from("staff_members")
      .insert({ ...f, tenant_id: tenantId, monthly_salary: Number(f.monthly_salary) || 0 });
    if (error) return toast.error(error.message);
    toast.success("Staff added");
    setOpenAdd(false);
    setF({ name: "", role: "waiter", phone: "", monthly_salary: 0, join_date: today() });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this staff member?")) return;
    const { error } = await (supabase as any).from("staff_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Staff removed");
    load();
  }

  async function paySalary() {
    if (payAtt && payAtt.deductible > 0 && !payForm.deduct && !payAttDismissed) {
      const ok = confirm(
        `${openPay.name} has ${payAtt.deductible} deductible day(s) in attendance for this month.\n\nPay full salary without deduction?`,
      );
      if (!ok) return;
    }
    if (!(Number(payForm.amount) > 0)) return toast.error("Enter a valid amount");
    const absent = Number(payForm.absent_days) || 0;
    if (payForm.deduct && (absent < 0 || absent > calc.days))
      return toast.error(`Absent days must be between 0 and ${calc.days}`);

    const { error } = await (supabase as any).from("salary_payments").insert({
      tenant_id: tenantId,
      staff_id: openPay.id,
      amount: Number(payForm.amount) || 0,
      paid_on: payForm.paid_on,
      payment_mode: payForm.payment_mode,
      notes: payForm.notes,
      salary_month: `${payForm.salary_month}-01`,
      absent_days: payForm.deduct ? absent : 0,
      deduction_amount: payForm.deduct ? calc.deduction : 0,
      gross_amount: monthlySalary,
    });
    if (error) return toast.error(error.message);
    toast.success("Salary paid");
    setOpenPay(null);
    load();
  }

  /* ---------- Derived data ---------- */
  const staffById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  const roles = useMemo(() => Array.from(new Set(staff.map((s) => (s.role || "").toLowerCase()).filter(Boolean))).sort(), [staff]);

  const totalMonthly = staff.filter((s) => s.status === "active").reduce((a, b) => a + Number(b.monthly_salary || 0), 0);
  const now = new Date();
  const totalPaidThisMonth = pays
    .filter((p) => {
      const d = new Date(p.paid_on);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((a, b) => a + Number(b.amount || 0), 0);

  const filteredStaff = useMemo(() => {
    const q = staffQ.trim().toLowerCase();
    return staff.filter((s) => {
      if (staffRole !== "all" && (s.role || "").toLowerCase() !== staffRole) return false;
      if (staffStatus !== "all" && s.status !== staffStatus) return false;
      if (!q) return true;
      return [s.name, s.phone, s.role].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [staff, staffQ, staffRole, staffStatus]);

  const filteredPays = useMemo(() => {
    const q = payQ.trim().toLowerCase();
    return pays.filter((p) => {
      if (payMode !== "all" && p.payment_mode !== payMode) return false;
      if (payStaff !== "all" && p.staff_id !== payStaff) return false;
      if (payFrom && p.paid_on < payFrom) return false;
      if (payTo && p.paid_on > payTo) return false;
      if (!q) return true;
      const name = staffById[p.staff_id]?.name || "";
      return [name, p.notes].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [pays, payQ, payMode, payStaff, payFrom, payTo, staffById]);

  const filteredPaysTotal = filteredPays.reduce((a, b) => a + Number(b.amount || 0), 0);

  // Reset to page 1 when filters change
  useEffect(() => setStaffPage(1), [staffQ, staffRole, staffStatus]);
  useEffect(() => setPayPage(1), [payQ, payMode, payStaff, payFrom, payTo]);

  const staffRows = filteredStaff.slice((staffPage - 1) * PAGE_SIZE, staffPage * PAGE_SIZE);
  const payRows = filteredPays.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);

  const payFiltersActive = payQ || payMode !== "all" || payStaff !== "all" || payFrom || payTo;

  function slipFor(p: any) {
    const s = staffById[p.staff_id];
    if (!s) return toast.error("Staff record not found for this payment");
    try {
      downloadSalarySlip(business, s, p);
    } catch (e: any) {
      toast.error(e?.message || "Could not generate slip");
    }
  }

  function slipsForFiltered() {
    const items = filteredPays
      .filter((p) => staffById[p.staff_id])
      .map((p) => ({ staff: staffById[p.staff_id], payment: p }));
    if (!items.length) return toast.error("No payments to download");
    if (items.length > 200) return toast.error("Too many slips — narrow the filters to 200 or fewer");
    downloadSalarySlips(business, items, `Salary_Slips_${today()}.pdf`);
    toast.success(`${items.length} slip(s) downloaded`);
  }
  const clearPayFilters = () => {
    setPayQ("");
    setPayMode("all");
    setPayStaff("all");
    setPayFrom("");
    setPayTo("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersRound className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Staff</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenAttendance(true)}>
            <CalendarCheck className="mr-1 h-4 w-4" />
            Attendance
          </Button>
          <Button onClick={() => setOpenAdd(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add staff
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Active staff</div>
          <div className="text-2xl font-semibold">{staff.filter((s) => s.status === "active").length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Monthly payroll</div>
          <div className="text-2xl font-semibold">{money(totalMonthly)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Paid this month</div>
          <div className="text-2xl font-semibold">{money(totalPaidThisMonth)}</div>
        </Card>
      </div>

      {/* ---------- Staff list ---------- */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBox value={staffQ} onChange={setStaffQ} placeholder="Search name, phone, role" />
          <div className="flex gap-2">
            <Select value={staffRole} onValueChange={setStaffRole}>
              <SelectTrigger className="h-8 w-36 capitalize"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={staffStatus} onValueChange={setStaffStatus}>
              <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Role</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Salary</th>
                <th className="p-3">Joined</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 capitalize">{s.role}</td>
                  <td className="p-3">{s.phone || "—"}</td>
                  <td className="p-3">{money(Number(s.monthly_salary || 0))}</td>
                  <td className="p-3">{s.join_date}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOpenPay(s);
                        setPayForm(newPayForm(Number(s.monthly_salary || 0)));
                      }}
                    >
                      <Wallet className="mr-1 h-3 w-3" />
                      Pay
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-1 text-destructive" onClick={() => remove(s.id)} aria-label={`Remove ${s.name}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {staff.length === 0 ? "No staff yet" : "No staff match your filters"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={staffPage} total={filteredStaff.length} onChange={setStaffPage} />
      </Card>

      {/* ---------- Salary payments ---------- */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between px-3 pt-3">
          <div className="font-medium">Salary payments</div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Total: <span className="font-semibold text-foreground">{money(filteredPaysTotal)}</span>
            </span>
            <Button size="sm" variant="outline" className="h-7" onClick={slipsForFiltered} disabled={!filteredPays.length}>
              <FileDown className="mr-1 h-3 w-3" />
              Download slips ({filteredPays.length})
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchBox value={payQ} onChange={setPayQ} placeholder="Search staff or notes" />
          <Select value={payStaff} onValueChange={setPayStaff}>
            <SelectTrigger className="h-8 w-full lg:w-40"><SelectValue placeholder="Staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={payMode} onValueChange={setPayMode}>
            <SelectTrigger className="h-8 w-full lg:w-44"><SelectValue placeholder="Mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              {PAYMENT_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input type="date" value={payFrom} onChange={(e) => setPayFrom(e.target.value)} className="h-8 w-36" aria-label="From date" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={payTo} onChange={(e) => setPayTo(e.target.value)} className="h-8 w-36" aria-label="To date" />
          </div>
          {payFiltersActive && (
            <Button size="sm" variant="ghost" className="h-8" onClick={clearPayFilters}>
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 font-medium">Staff</th>
                <th className="px-3 py-1.5 font-medium">Mode</th>
                <th className="px-3 py-1.5 font-medium">Notes</th>
                <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                <th className="px-3 py-1.5 text-right font-medium">Slip</th>
              </tr>
            </thead>
            <tbody>
              {payRows.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-1.5">{format(new Date(p.paid_on), "dd MMM yyyy")}</td>
                  <td className="px-3 py-1.5 font-medium">{staffById[p.staff_id]?.name || "—"}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                      {modeLabel(p.payment_mode)}
                    </Badge>
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-1.5 text-muted-foreground" title={p.notes || ""}>
                    {p.notes || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <div className="font-semibold">{money(Number(p.amount || 0))}</div>
                    {Number(p.deduction_amount) > 0 && (
                      <div className="text-[10px] text-destructive">
                        −{money(Number(p.deduction_amount))} · {p.absent_days}d absent
                      </div>
                    )}
                    {p.salary_month && (
                      <div className="text-[10px] text-muted-foreground">for {format(new Date(p.salary_month), "MMM yyyy")}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => slipFor(p)}
                      aria-label={`Download salary slip for ${staffById[p.staff_id]?.name || "staff"}`}
                      title="Download salary slip"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredPays.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    {pays.length === 0 ? "No payments recorded." : "No payments match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={payPage} total={filteredPays.length} onChange={setPayPage} />
      </Card>

      <AttendanceDialog open={openAttendance} onOpenChange={setOpenAttendance} tenantId={tenantId} staff={staff} />

      {/* ---------- Add staff dialog ---------- */}
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <Input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="waiter, chef…" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              </div>
              <div>
                <Label>Monthly salary</Label>
                <Input type="number" value={f.monthly_salary} onChange={(e) => setF({ ...f, monthly_salary: e.target.value })} />
              </div>
              <div>
                <Label>Join date</Label>
                <Input type="date" value={f.join_date} onChange={(e) => setF({ ...f, join_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={add}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Pay dialog ---------- */}
      <Dialog open={!!openPay} onOpenChange={(o) => !o && setOpenPay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay {openPay?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Salary month</Label>
                <Input
                  type="month"
                  value={payForm.salary_month}
                  onChange={(e) => setPayForm({ ...payForm, salary_month: e.target.value || thisMonth() })}
                />
              </div>
              <div>
                <Label>Monthly salary</Label>
                <Input value={money(monthlySalary)} disabled />
              </div>
            </div>

            {/* Attendance-based prompt */}
            {payAtt && (
              <div className="text-xs text-muted-foreground">
                Attendance: {payAtt.present} present · {payAtt.absent} absent · {payAtt.half_day} half day · {payAtt.leave} paid leave ·{" "}
                {daysInMonth(payForm.salary_month) - payAtt.marked} unmarked
              </div>
            )}
            {payAtt && payAtt.deductible > 0 && !payForm.deduct && !payAttDismissed && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                <div>
                  {openPay?.name} has <b>{payAtt.deductible} deductible day(s)</b> this month. Deduct{" "}
                  <b>{money(calcSalary(monthlySalary, payForm.salary_month, payAtt.deductible).deduction)}</b> from salary?
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => setPayForm({ ...payForm, deduct: true, absent_days: payAtt.deductible })}>
                    Yes, deduct
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPayAttDismissed(true)}>
                    No, pay full salary
                  </Button>
                </div>
              </div>
            )}

            {/* Optional absence deduction */}
            <div className="rounded-md border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={payForm.deduct}
                  onChange={(e) =>
                    setPayForm({
                      ...payForm,
                      deduct: e.target.checked,
                      absent_days: e.target.checked ? payForm.absent_days : 0,
                      amount: e.target.checked ? payForm.amount : monthlySalary,
                    })
                  }
                />
                Deduct salary for absent days
              </label>

              {payForm.deduct && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Absent days</Label>
                      <Input
                        type="number"
                        min={0}
                        max={calc.days}
                        step={0.5}
                        value={payForm.absent_days}
                        onChange={(e) => setPayForm({ ...payForm, absent_days: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Per-day salary</Label>
                      <Input value={money(calc.perDay)} disabled />
                    </div>
                  </div>
                  <div className="space-y-1 rounded bg-muted/40 p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Days in month</span>
                      <span>{calc.days}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Deduction ({Number(payForm.absent_days) || 0} × {money(calc.perDay)})
                      </span>
                      <span className="text-destructive">−{money(calc.deduction)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Net payable</span>
                      <span>{money(calc.net)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount paid</Label>
                <Input
                  type="number"
                  value={payForm.amount}
                  disabled={payForm.deduct}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>Paid on</Label>
                <Input type="date" value={payForm.paid_on} onChange={(e) => setPayForm({ ...payForm, paid_on: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Payment mode</Label>
              <Select value={payForm.payment_mode} onValueChange={(v) => setPayForm({ ...payForm, payment_mode: v })}>
                <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                placeholder="e.g. UTR / cheque no., advance, bonus"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={paySalary}>Record payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}