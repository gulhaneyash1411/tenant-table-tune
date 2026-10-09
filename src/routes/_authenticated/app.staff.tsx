import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/use-session";
import { planLimitError } from "@/lib/plan-limits";
import { fetchCurrentOutlet } from "@/lib/outlet-context";
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
import {
  UsersRound,
  Wallet,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  FileDown,
  CalendarCheck,
  Eraser,
  Pencil,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

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

// Payable days in a month, counted from the joining date (joining day included).
// Joined before the month -> full month; joined after the month -> 0.
function eligibleDaysFor(ym: string, joinDate?: string | null) {
  const days = daysInMonth(ym);
  if (!joinDate) return days;
  const j = String(joinDate).slice(0, 10);
  const start = `${ym}-01`;
  const end = `${ym}-${String(days).padStart(2, "0")}`;
  if (j <= start) return days;
  if (j > end) return 0;
  return days - Number(j.slice(8, 10)) + 1;
}

function calcSalary(monthly: number, ym: string, absent: number, joinDate?: string | null) {
  const days = daysInMonth(ym);
  const eligible = eligibleDaysFor(ym, joinDate);
  const perDay = monthly / days;
  // Salary earned for the payable days (full salary when the whole month is payable)
  const gross = eligible === days ? monthly : round2(perDay * eligible);
  const safeAbsent = Math.min(Math.max(0, absent || 0), eligible);
  const deduction = round2(perDay * safeAbsent);
  return {
    days,
    eligible,
    prorated: eligible < days,
    perDay: round2(perDay),
    gross,
    deduction,
    net: round2(gross - deduction),
  };
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
  const eligible = eligibleDaysFor(format(monthDate, "yyyy-MM"), staff.join_date);
  const prorated = eligible > 0 && eligible < days;
  const perDay = eligible ? gross / eligible : 0;

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
  kv("Paid days", prorated ? `${eligible} of ${days}` : String(days), R);
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

  pdf.text(prorated ? `Salary (${eligible} of ${days} days, from joining)` : "Monthly salary", M + 3, y + 5.5);
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

function SearchBox({
  value,
  onChange,
  placeholder,
  className = "w-full sm:w-64",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 pl-8" />
    </div>
  );
}

/* ---------- Role filter (shared by both attendance tabs) ---------- */
const rolesOf = (list: any[]) =>
  Array.from(new Set(list.map((s) => (s.role || "").toLowerCase()).filter(Boolean))).sort();

function RoleFilter({
  value,
  onChange,
  roles,
  className = "h-8 w-full sm:w-40",
}: {
  value: string;
  onChange: (v: string) => void;
  roles: string[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`${className} capitalize`} aria-label="Filter by role">
        <SelectValue placeholder="Role" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All roles</SelectItem>
        {roles.map((r) => (
          <SelectItem key={r} value={r} className="capitalize">
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SectionToggle({ open, onToggle, controls, label }: { open: boolean; onToggle: () => void; controls: string; label: string }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
      title={open ? "Collapse" : "Expand"}
    >
      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </Button>
  );
}

/* =====================================================================
   Attendance
   ===================================================================== */
type AttStatus = "present" | "absent" | "half_day" | "leave";
const ATT: Record<AttStatus, { short: string; label: string; cls: string; bar: string }> = {
  present: {
    short: "P",
    label: "Present",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  absent: {
    short: "A",
    label: "Absent",
    cls: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300",
    bar: "bg-red-500",
  },
  half_day: {
    short: "H",
    label: "Half day",
    cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  leave: {
    short: "PL",
    label: "Paid leave",
    cls: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300",
    bar: "bg-sky-500",
  },
};
const ATT_KEYS = Object.keys(ATT) as AttStatus[];
const monthBounds = (ym: string) => ({ start: `${ym}-01`, end: `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}` });
// Absent = 1 day, half day = 0.5 day. Paid leave and unmarked days are not deducted.
const deductibleDays = (c: { absent: number; half_day: number }) => c.absent + c.half_day * 0.5;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateOf = (ym: string, d: number) => `${ym}-${String(d).padStart(2, "0")}`;
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const countMarks = (row: Record<number, AttStatus>) => {
  const c = { present: 0, absent: 0, half_day: 0, leave: 0 };
  Object.values(row).forEach((v) => c[v]++);
  return c;
};

/* ---------- Monthly register: staff list + calendar, click a date to pick P / A / H / PL ---------- */
function MonthlyRegister({
  tenantId,
  staff,
  role,
  onRoleChange,
  roles,
  onDirtyChange,
  onSaved,
}: {
  tenantId: string;
  staff: any[];
  role: string;
  onRoleChange: (v: string) => void;
  roles: string[];
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
}) {
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [pickDay, setPickDay] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  // Unsaved changes: staffId -> day -> status (null = clear)
  const [draft, setDraft] = useState<Record<string, Record<number, AttStatus | null>>>({});
  const table = (supabase as any).from.bind(supabase);

  async function load() {
    const { start, end } = monthBounds(month);
    setLoading(true);
    const { data, error } = await table("staff_attendance")
      .select("staff_id,attendance_date,status")
      .eq("tenant_id", tenantId)
      .gte("attendance_date", start)
      .lte("attendance_date", end);
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows(data || []);
  }
  useEffect(() => {
    if (tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, tenantId]);

  // Staff shown in the list: role filter + name search
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return staff.filter(
      (s) =>
        (role === "all" || (s.role || "").toLowerCase() === role) &&
        (!needle || (s.name || "").toLowerCase().includes(needle)),
    );
  }, [staff, q, role]);

  // Keep a valid selection within the visible list
  useEffect(() => {
    if (!visible.some((s) => s.id === selectedId)) setSelectedId(visible[0]?.id ?? "");
  }, [visible, selectedId]);

  // Close the day picker when month/staff changes, on outside click or Escape
  useEffect(() => setPickDay(null), [month, selectedId]);
  useEffect(() => {
    if (pickDay === null) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-day-cell]")) setPickDay(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickDay(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickDay]);

  // Saved (database) marks
  const savedMap = useMemo(() => {
    const m: Record<string, Record<number, AttStatus>> = {};
    rows.forEach((r) => {
      (m[r.staff_id] ??= {})[Number(r.attendance_date.slice(8, 10))] = r.status;
    });
    return m;
  }, [rows]);

  // Saved marks with unsaved changes applied — what the screen shows
  const map = useMemo(() => {
    const m: Record<string, Record<number, AttStatus>> = {};
    Object.entries(savedMap).forEach(([id, r]) => (m[id] = { ...r }));
    Object.entries(draft).forEach(([id, changes]) => {
      const r = (m[id] ??= {});
      Object.entries(changes).forEach(([day, st]) => {
        if (st) r[Number(day)] = st;
        else delete r[Number(day)];
      });
    });
    return m;
  }, [savedMap, draft]);

  const dirtyCount = Object.values(draft).reduce((a, c) => a + Object.keys(c).length, 0);
  useEffect(() => onDirtyChange?.(dirtyCount > 0), [dirtyCount, onDirtyChange]);

  const todayStr = today();
  const days = daysInMonth(month);
  const [yy, mm] = month.split("-").map(Number);
  const lead = new Date(yy, mm - 1, 1).getDay();
  const pastDays = Array.from({ length: days }, (_, i) => i + 1).filter((d) => dateOf(month, d) <= todayStr);
  const isCurrentOrLater = month >= thisMonth();
  const totalRows = Math.ceil((lead + days) / 7);

  const selected = staff.find((s) => s.id === selectedId);
  const selRow = map[selectedId] || {};
  const selDraft = draft[selectedId] || {};
  const selCount = countMarks(selRow);
  const selDeduct = deductibleDays(selCount);
  const selUnmarked = pastDays.filter((d) => !selRow[d]).length;
  const selDeductAmt = selected ? calcSalary(Number(selected.monthly_salary || 0), month, selDeduct).deduction : 0;

  function changeMonth(ym: string) {
    if (ym === month) return;
    if (dirtyCount && !confirm(`You have ${dirtyCount} unsaved change(s). Discard them?`)) return;
    setDraft({});
    setMonth(ym);
  }

  // Stage changes locally; an entry equal to the saved value is dropped
  function stage(staffId: string, changes: [number, AttStatus | null][]) {
    setDraft((prev) => {
      const next = { ...(prev[staffId] || {}) };
      changes.forEach(([day, st]) => {
        if ((st ?? undefined) === savedMap[staffId]?.[day]) delete next[day];
        else next[day] = st;
      });
      const out = { ...prev, [staffId]: next };
      if (!Object.keys(next).length) delete out[staffId];
      return out;
    });
  }

  function setStatus(day: number, next?: AttStatus) {
    setPickDay(null);
    if (!selectedId || dateOf(month, day) > todayStr) return;
    stage(selectedId, [[day, next ?? null]]);
  }

  function fillUnmarkedPresent() {
    const missing = pastDays.filter((d) => !selRow[d]);
    if (!missing.length) return toast.info("Every day so far is already marked");
    stage(selectedId, missing.map((d) => [d, "present"]));
  }

  function clearMonth() {
    const marked = Object.keys(selRow).map(Number);
    if (!marked.length) return;
    stage(selectedId, marked.map((d) => [d, null]));
  }

  function discard() {
    setDraft({});
  }

  async function saveAll() {
    if (!dirtyCount) return;
    const upserts: any[] = [];
    const deletes: Record<string, string[]> = {};
    Object.entries(draft).forEach(([staffId, changes]) =>
      Object.entries(changes).forEach(([day, st]) => {
        const d = dateOf(month, Number(day));
        if (st) upserts.push({ tenant_id: tenantId, staff_id: staffId, attendance_date: d, status: st });
        else (deletes[staffId] ??= []).push(d);
      }),
    );
    setSaving(true);
    const results = await Promise.all([
      upserts.length
        ? table("staff_attendance").upsert(upserts, { onConflict: "staff_id,attendance_date" })
        : Promise.resolve({ error: null }),
      ...Object.entries(deletes).map(([staffId, dates]) =>
        table("staff_attendance").delete().eq("staff_id", staffId).in("attendance_date", dates),
      ),
    ]);
    setSaving(false);
    const err = results.find((r: any) => r.error)?.error;
    if (err) {
      toast.error(err.message);
      load();
      return;
    }
    toast.success(`Attendance saved · ${dirtyCount} change(s)`);
    setDraft({});
    onSaved?.();
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3 pr-1">
      {/* Month navigation + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="month"
            max={thisMonth()}
            value={month}
            onChange={(e) => changeMonth(e.target.value || thisMonth())}
            className="h-8 w-36 sm:w-40"
            aria-label="Month"
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={isCurrentOrLater}
            onClick={() => changeMonth(shiftMonth(month, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {loading && <span className="ml-2 text-xs text-muted-foreground">Loading…</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {ATT_KEYS.map((k) => (
            <span key={k} className={`rounded border px-1.5 py-0.5 ${ATT[k].cls}`}>
              {ATT[k].short} = {ATT[k].label}
            </span>
          ))}
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">Add active staff to start the register.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[260px_1fr]">
          {/* Staff list */}
          <div className="flex flex-col rounded-md border">
            <div className="space-y-2 border-b p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find staff" className="h-8 pl-8" />
              </div>
              <RoleFilter value={role} onChange={onRoleChange} roles={roles} className="h-8 w-full" />
            </div>
            <ul className="max-h-[38vh] divide-y overflow-y-auto md:max-h-[52vh]">
              {visible.map((s) => {
                const row = map[s.id] || {};
                const c = countMarks(row);
                const ded = deductibleDays(c);
                const on = s.id === selectedId;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedId(s.id)}
                      aria-current={on}
                      className={`w-full px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                        on ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`flex items-center gap-1.5 truncate text-sm ${on ? "font-semibold" : "font-medium"}`}>
                          {s.name}
                          {draft[s.id] && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />}
                        </span>
                        <span className={`shrink-0 text-xs ${ded > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                          {ded > 0 ? `${ded}d deduct` : "No deduction"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        {ATT_KEYS.map((k) =>
                          c[k] ? <div key={k} className={ATT[k].bar} style={{ width: `${(c[k] / days) * 100}%` }} /> : null,
                        )}
                      </div>
                      <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                        {ATT_KEYS.map((k) => (
                          <span key={k}>
                            {ATT[k].short} {c[k]}
                          </span>
                        ))}
                      </div>
                    </button>
                  </li>
                );
              })}
              {visible.length === 0 && (
                <li className="p-4 text-center text-xs text-muted-foreground">No staff match the current filters</li>
              )}
            </ul>
          </div>

          {/* Calendar for selected staff */}
          {selected && (
            <div className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold">{selected.name}</div>
                  <div className="text-xs capitalize text-muted-foreground">
                    {selected.role || "Staff"} · {money(Number(selected.monthly_salary || 0))} / month
                  </div>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={saving || selUnmarked === 0} onClick={fillUnmarkedPresent}>
                    Mark {selUnmarked} unmarked present
                  </Button>
                  <Button size="sm" variant="ghost" className="flex-1 text-destructive sm:flex-none" disabled={saving || !Object.keys(selRow).length} onClick={clearMonth}>
                    Clear month
                  </Button>
                </div>
              </div>

              {/* Summary strip */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-3 md:grid-cols-6">
                {ATT_KEYS.map((k) => (
                  <div key={k} className={`rounded-md border px-2 py-1.5 ${ATT[k].cls}`}>
                    <div className="text-lg font-semibold leading-none">{selCount[k]}</div>
                    <div className="mt-1 text-[11px]">{ATT[k].label}</div>
                  </div>
                ))}
                <div className="rounded-md border border-dashed px-2 py-1.5">
                  <div className="text-lg font-semibold leading-none">{selUnmarked}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Unmarked</div>
                </div>
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5">
                  <div className="text-lg font-semibold leading-none text-destructive">{selDeduct}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">−{money(selDeductAmt)}</div>
                </div>
              </div>

              {/* Calendar grid */}
              <div className="mt-3 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={`pb-1 text-center text-[11px] font-medium ${i === 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {w}
                  </div>
                ))}
                {Array.from({ length: lead }).map((_, i) => (
                  <div key={`lead-${i}`} />
                ))}
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const ds = dateOf(month, d);
                  const st = selRow[d];
                  const future = ds > todayStr;
                  const isToday = ds === todayStr;
                  const pos = lead + d - 1;
                  const col = pos % 7;
                  const rowIdx = Math.floor(pos / 7);
                  const sunday = col === 0;
                  const open = pickDay === d;
                  const unsaved = d in selDraft;
                  const hAlign = col <= 1 ? "left-0" : col >= 5 ? "right-0" : "left-1/2 -translate-x-1/2";
                  const vAlign = rowIdx >= totalRows - 2 && totalRows > 3 ? "bottom-full mb-1" : "top-full mt-1";
                  return (
                    <div key={d} className="relative" data-day-cell>
                      <button
                        disabled={future}
                        onClick={() => setPickDay(open ? null : d)}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-label={`${format(new Date(yy, mm - 1, d), "EEEE d MMMM")}: ${st ? ATT[st].label : "not marked"}`}
                        className={`flex h-12 w-full flex-col justify-between rounded-md border p-1 text-left sm:h-14 sm:p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          st
                            ? ATT[st].cls
                            : `border-dashed border-muted-foreground/30 ${sunday ? "bg-red-50/60 dark:bg-red-950/20" : ""}`
                        } ${isToday || open ? "ring-2 ring-primary" : ""} ${future ? "cursor-not-allowed opacity-35" : "hover:brightness-95"}`}
                      >
                        <span className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${sunday && !st ? "text-red-500" : ""}`}>{d}</span>
                          {unsaved && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Not saved yet" />}
                        </span>
                        <span className="text-sm font-bold leading-none">{st ? ATT[st].short : ""}</span>
                      </button>

                      {open && (
                        <div
                          role="menu"
                          aria-label={`Set attendance for ${d}`}
                          className={`absolute z-30 flex gap-1 rounded-md border bg-popover p-1 shadow-lg ${hAlign} ${vAlign}`}
                        >
                          {ATT_KEYS.map((k, i) => (
                            <button
                              key={k}
                              role="menuitem"
                              autoFocus={i === 0}
                              title={ATT[k].label}
                              onClick={() => setStatus(d, k)}
                              className={`h-8 min-w-8 rounded border px-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${ATT[k].cls} ${
                                st === k ? "ring-2 ring-primary" : "hover:brightness-95"
                              }`}
                            >
                              {ATT[k].short}
                            </button>
                          ))}
                          {st && (
                            <button
                              role="menuitem"
                              title="Clear"
                              aria-label="Clear"
                              onClick={() => setStatus(d)}
                              className="flex h-8 w-8 items-center justify-center rounded border text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Eraser className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Click a date and choose P, A, H or PL, then save. Dots mark changes not saved yet. Absent counts as 1 day and half day
                as 0.5 day of deduction.
              </p>
            </div>
          )}
        </div>
      )}

      </div>

      {/* Save bar: fixed at the bottom-right of the modal */}
      {staff.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-3 sm:justify-end">
          <span className={`text-xs ${dirtyCount ? "font-medium text-foreground" : "text-muted-foreground"}`}>
            {dirtyCount ? `${dirtyCount} unsaved change(s)` : "All changes saved"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={discard} disabled={saving || !dirtyCount}>
              Discard
            </Button>
            <Button onClick={saveAll} disabled={saving || !dirtyCount}>
              {saving ? "Saving…" : "Save attendance"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [monthDirty, setMonthDirty] = useState(false);
  const discardOk = () => !monthDirty || confirm("You have unsaved attendance changes. Discard them?");
  // Close without the unsaved-changes prompt (everything was just saved)
  const closeAfterSave = () => {
    setMonthDirty(false);
    onOpenChange(false);
  };
  const handleOpenChange = (o: boolean) => {
    if (!o && !discardOk()) return;
    if (!o) setMonthDirty(false);
    onOpenChange(o);
  };

  // Role filter shared by both tabs
  const [role, setRole] = useState("all");
  const active = staff.filter((s) => (s.status ?? "active") === "active");
  const roles = rolesOf(active);
  const visibleActive = role === "all" ? active : active.filter((s) => (s.role || "").toLowerCase() === role);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, date, tenantId]);

  async function saveDay() {
    const rows = Object.entries(marks).map(([staff_id, status]) => ({ tenant_id: tenantId, staff_id, attendance_date: date, status }));
    if (!rows.length) return toast.error("Mark at least one staff member");
    setSaving(true);
    const { error } = await table("staff_attendance").upsert(rows, { onConflict: "staff_id,attendance_date" });
    setSaving(false);
    if (error) return toast.error(error.message);
    const unmarked = active.length - rows.length;
    toast.success(`Attendance saved for ${format(new Date(date), "dd MMM yyyy")}${unmarked > 0 ? ` · ${unmarked} unmarked` : ""}`);
    closeAfterSave();
  }

  const markedCount = Object.keys(marks).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-lg p-4 sm:w-full sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-base sm:text-lg">Staff attendance</DialogTitle>
        </DialogHeader>

        <div className="inline-flex w-fit rounded-md border p-0.5 text-sm">
          {(["daily", "monthly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                if (t === tab) return;
                if (tab === "monthly" && !discardOk()) return;
                setMonthDirty(false);
                setTab(t);
              }}
              className={`rounded px-3 py-1 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "daily" ? "Mark attendance" : "Monthly register"}
            </button>
          ))}
        </div>

        {tab === "daily" ? (
          <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3 pr-1">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label>Date</Label>
                  <Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value || today())} className="h-8 w-full sm:w-44" />
                </div>
                <div>
                  <Label>Role</Label>
                  <RoleFilter value={role} onChange={setRole} roles={roles} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setMarks({ ...marks, ...Object.fromEntries(visibleActive.map((s) => [s.id, "present" as AttStatus])) })
                  }
                >
                  Mark {role === "all" ? "all" : "listed"} present
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setMarks(Object.fromEntries(Object.entries(marks).filter(([id]) => !visibleActive.some((s) => s.id === id))))
                  }
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="divide-y rounded-md border">
              {visibleActive.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs capitalize text-muted-foreground">{s.role}</div>
                  </div>
                  <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                    {ATT_KEYS.map((k) => {
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
              {visibleActive.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {active.length === 0 ? "No active staff" : "No staff match this role"}
                </div>
              )}
            </div>

          </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3 sm:justify-end">
              <span className="text-xs text-muted-foreground">
                {markedCount} of {active.length} marked
              </span>
              <Button onClick={saveDay} disabled={saving || !markedCount}>
                {saving ? "Saving…" : "Save attendance"}
              </Button>
            </div>
          </div>
        ) : (
          <MonthlyRegister
            tenantId={tenantId}
            staff={active}
            role={role}
            onRoleChange={setRole}
            roles={roles}
            onDirtyChange={setMonthDirty}
            onSaved={closeAfterSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Leave details: which dates were absent / half day / paid leave for a paid salary month ---------- */
function LeaveDetailsDialog({
  payment,
  staffName,
  onClose,
}: {
  payment: any | null;
  staffName: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ attendance_date: string; status: AttStatus }[]>([]);
  const [loading, setLoading] = useState(false);
  const ym = payment?.salary_month ? String(payment.salary_month).slice(0, 7) : "";

  useEffect(() => {
    setRows([]);
    if (!payment || !ym) return;
    const { start, end } = monthBounds(ym);
    setLoading(true);
    (supabase as any)
      .from("staff_attendance")
      .select("attendance_date,status")
      .eq("staff_id", payment.staff_id)
      .gte("attendance_date", start)
      .lte("attendance_date", end)
      .in("status", ["absent", "half_day", "leave"])
      .order("attendance_date")
      .then(({ data, error }: any) => {
        setLoading(false);
        if (error) return toast.error(error.message);
        setRows(data || []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id, ym]);

  const counts = useMemo(() => {
    const c = { absent: 0, half_day: 0, leave: 0 };
    rows.forEach((r) => {
      if (r.status in c) c[r.status as keyof typeof c]++;
    });
    return c;
  }, [rows]);
  const registerDeductible = deductibleDays(counts);
  const recordedAbsent = Number(payment?.absent_days || 0);
  const mismatch = !loading && payment && recordedAbsent !== registerDeductible;

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      {/* Mobile: fills the screen width with a small gutter; desktop: max-w-md */}
      <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-1.5rem)] max-w-md flex-col gap-3 overflow-hidden rounded-lg p-4 sm:w-full sm:p-5">
        <DialogHeader className="text-left">
          <DialogTitle className="flex flex-wrap items-baseline gap-x-1 pr-6 text-base sm:text-lg">
            <span>Leaves · {staffName}</span>
            {ym && <span className="font-normal text-muted-foreground">· {format(new Date(`${ym}-01T00:00:00`), "MMMM yyyy")}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {(["absent", "half_day", "leave"] as const).map((k) => (
            <div key={k} className={`rounded-md border px-2 py-1.5 ${ATT[k].cls}`}>
              <div className="text-base font-semibold leading-tight">{counts[k]}</div>
              <div>{ATT[k].label}</div>
            </div>
          ))}
        </div>
        {payment && (
          <div className="space-y-1 rounded bg-muted/40 p-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deducted days</span>
              <span>{recordedAbsent}d</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deduction</span>
              <span className="font-medium text-destructive">−{money(Number(payment.deduction_amount || 0))}</span>
            </div>
            {mismatch && (
              <div className="pt-1 text-[11px] text-amber-700 dark:text-amber-400">
                Attendance register shows {registerDeductible}d deductible (absent = 1d, half day = 0.5d); this payment deducted {recordedAbsent}d.
              </div>
            )}
          </div>
        )}

        {/* Dates */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No absences or leaves marked in attendance for this month.</div>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.attendance_date} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5">
                  <span className="text-xs sm:text-sm">{format(new Date(`${r.attendance_date}T00:00:00`), "EEE, dd MMM yyyy")}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${ATT[r.status]?.cls ?? ""}`}>
                    {ATT[r.status]?.label ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Yes / No confirmation dialog (mobile friendly) ---------- */
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Yes, delete",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-lg p-4 sm:w-full sm:p-5">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-base sm:text-lg">{title}</DialogTitle>
        </DialogHeader>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onCancel} disabled={busy} autoFocus>
            No
          </Button>
          <Button variant="destructive" className="w-full sm:w-auto" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StaffPage() {
  const { plan: ownerPlan } = useTenantContext();
  const [tenantId, setTenantId] = useState<string>("");
  const [business, setBusiness] = useState<{ name: string; address?: string; phone?: string }>({ name: "" });
  const [staff, setStaff] = useState<any[]>([]);
  const [pays, setPays] = useState<any[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = adding new staff
  const [openPay, setOpenPay] = useState<any>(null);
  const [f, setF] = useState<any>({ name: "", role: "waiter", phone: "", monthly_salary: 0, join_date: today() });
  const [payForm, setPayForm] = useState<any>(newPayForm());
  const [openAttendance, setOpenAttendance] = useState(false);
  const [leavePay, setLeavePay] = useState<any>(null); // payment whose leave details are open
  const [deletePay, setDeletePay] = useState<any>(null); // payment pending deletion
  const [deleteStaffRow, setDeleteStaffRow] = useState<any>(null); // staff pending deletion
  const [deleting, setDeleting] = useState(false);
  const [staffOpen, setStaffOpen] = useState(true);
  const [paysOpen, setPaysOpen] = useState(true);

  // Attendance summary for the staff member + month being paid
  const [payAtt, setPayAtt] = useState<null | { present: number; absent: number; half_day: number; leave: number; marked: number; deductible: number }>(null);
  const [payAttDismissed, setPayAttDismissed] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const [paying, setPaying] = useState(false);
  useEffect(() => {
    setPayAtt(null);
    setPayAttDismissed(false);
    setConfirmPay(false);
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
  const calc = calcSalary(monthlySalary, payForm.salary_month || thisMonth(), Number(payForm.absent_days), openPay?.join_date);

  // Keep amount in sync with joining-date proration and absence deduction
  useEffect(() => {
    if (openPay) setPayForm((pf: any) => ({ ...pf, amount: pf.deduct ? calc.net : calc.gross }));
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
  const [payRole, setPayRole] = useState("all");
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");
  const [payPage, setPayPage] = useState(1);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const t = await fetchCurrentOutlet(u.user!.id);
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

  const emptyStaff = () => ({ name: "", role: "waiter", phone: "", monthly_salary: 0, join_date: today(), status: "active" });

  function openAddStaff() {
    setEditingId(null);
    setF(emptyStaff());
    setOpenAdd(true);
  }

  function openEditStaff(s: any) {
    setEditingId(s.id);
    setF({
      name: s.name || "",
      role: s.role || "",
      phone: s.phone || "",
      monthly_salary: Number(s.monthly_salary || 0),
      join_date: (s.join_date || "").slice(0, 10),
      status: s.status || "active",
    });
    setOpenAdd(true);
  }

  async function saveStaff() {
    if (!f.name.trim()) return toast.error("Name required");
    const salary = Number(f.monthly_salary);
    if (!(salary >= 0)) return toast.error("Enter a valid monthly salary");
    const payload = {
      name: f.name.trim(),
      role: (f.role || "").trim(),
      phone: (f.phone || "").trim(),
      monthly_salary: salary || 0,
      join_date: f.join_date || null,
      status: f.status || "active",
    };
    if (!editingId) {
      const limitMsg = await planLimitError({ plan: ownerPlan, limit: "max_staff", tenantId, table: "staff_members", label: "staff members" });
      if (limitMsg) return toast.error(limitMsg);
    }
    const { error } = editingId
      ? await (supabase as any).from("staff_members").update(payload).eq("id", editingId)
      : await (supabase as any).from("staff_members").insert({ ...payload, tenant_id: tenantId });
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Staff updated" : "Staff added");
    setOpenAdd(false);
    setEditingId(null);
    setF(emptyStaff());
    load();
  }

  async function confirmRemoveStaff() {
    if (!deleteStaffRow) return;
    setDeleting(true);
    const { error } = await (supabase as any).from("staff_members").delete().eq("id", deleteStaffRow.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Staff removed");
    setDeleteStaffRow(null);
    load();
  }

  // Step 1: validate, then ask for confirmation inside the modal
  function requestPay() {
    if (calc.eligible === 0) return toast.error(`${openPay.name} joined after this month. Choose a later salary month.`);
    if (!(Number(payForm.amount) > 0)) return toast.error("Enter a valid amount");
    const absent = Number(payForm.absent_days) || 0;
    if (payForm.deduct && (absent < 0 || absent > calc.eligible))
      return toast.error(`Absent days must be between 0 and ${calc.eligible}`);
    setConfirmPay(true);
  }

  // Step 2: user said yes
  async function paySalary() {
    const absent = Number(payForm.absent_days) || 0;
    setPaying(true);
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
      gross_amount: calc.gross,
    });
    setPaying(false);
    if (error) {
      setConfirmPay(false);
      return toast.error(error.message);
    }
    toast.success("Salary paid");
    setConfirmPay(false);
    setOpenPay(null);
    load();
  }

  async function confirmRemovePayment() {
    if (!deletePay) return;
    setDeleting(true);
    const { error } = await (supabase as any).from("salary_payments").delete().eq("id", deletePay.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Payment deleted");
    setDeletePay(null);
    load();
  }

  /* ---------- Derived data ---------- */
  const staffById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  const roles = useMemo(() => rolesOf(staff), [staff]);

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
      if (payRole !== "all" && (staffById[p.staff_id]?.role || "").toLowerCase() !== payRole) return false;
      if (payFrom && p.paid_on < payFrom) return false;
      if (payTo && p.paid_on > payTo) return false;
      if (!q) return true;
      const name = staffById[p.staff_id]?.name || "";
      return [name, p.notes].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [pays, payQ, payMode, payStaff, payRole, payFrom, payTo, staffById]);

  const filteredPaysTotal = filteredPays.reduce((a, b) => a + Number(b.amount || 0), 0);

  // Reset to page 1 when filters change
  useEffect(() => setStaffPage(1), [staffQ, staffRole, staffStatus]);
  useEffect(() => setPayPage(1), [payQ, payMode, payStaff, payRole, payFrom, payTo]);

  const staffRows = filteredStaff.slice((staffPage - 1) * PAGE_SIZE, staffPage * PAGE_SIZE);
  const payRows = filteredPays.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);

  const payFiltersActive = payQ || payMode !== "all" || payStaff !== "all" || payRole !== "all" || payFrom || payTo;

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
    setPayRole("all");
    setPayFrom("");
    setPayTo("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <UsersRound className="h-5 w-5 sm:h-6 sm:w-6" />
          <h1 className="text-xl font-semibold sm:text-2xl">Staff</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setOpenAttendance(true)}>
            <CalendarCheck className="mr-1 h-4 w-4" />
            Attendance
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={openAddStaff}>
            <Plus className="mr-1 h-4 w-4" />
            Add staff
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">Active staff</div>
          <div className="text-xl font-semibold sm:text-2xl">{staff.filter((s) => s.status === "active").length}</div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">Monthly payroll</div>
          <div className="truncate text-xl font-semibold sm:text-2xl">{money(totalMonthly)}</div>
        </Card>
        <Card className="col-span-2 p-3 sm:p-4 md:col-span-1">
          <div className="text-xs text-muted-foreground">Paid this month</div>
          <div className="truncate text-xl font-semibold sm:text-2xl">{money(totalPaidThisMonth)}</div>
        </Card>
      </div>

      {/* ---------- Staff list ---------- */}
      <Card className="overflow-hidden p-0">
        <div className={`flex items-center justify-between px-3 py-2 ${staffOpen ? "border-b" : ""}`}>
          <div className="font-medium">
            Staff list <span className="text-xs font-normal text-muted-foreground">({filteredStaff.length})</span>
          </div>
          <SectionToggle open={staffOpen} onToggle={() => setStaffOpen((o) => !o)} controls="staff-list-body" label="staff list" />
        </div>
        {staffOpen && (
        <div id="staff-list-body">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBox value={staffQ} onChange={setStaffQ} placeholder="Search name, phone, role" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={staffRole} onValueChange={setStaffRole}>
              <SelectTrigger className="h-8 w-full capitalize sm:w-36"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={staffStatus} onValueChange={setStaffStatus}>
              <SelectTrigger className="h-8 w-full sm:w-32"><SelectValue placeholder="Status" /></SelectTrigger>
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
                <th className="hidden p-3 sm:table-cell">Role</th>
                <th className="hidden p-3 md:table-cell">Phone</th>
                <th className="p-3">Salary</th>
                <th className="hidden p-3 md:table-cell">Joined</th>
                <th className="hidden p-3 sm:table-cell">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3 font-medium">
                    <div>{s.name}</div>
                    {/* Details folded in on small screens, where their columns are hidden */}
                    <div className="mt-0.5 text-xs font-normal capitalize text-muted-foreground sm:hidden">
                      {[s.role, s.phone, (s.status ?? "active") === "active" ? "Active" : "Inactive"].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block md:hidden">
                      {[s.phone, s.join_date].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="hidden p-3 capitalize sm:table-cell">{s.role}</td>
                  <td className="hidden p-3 md:table-cell">{s.phone || "—"}</td>
                  <td className="whitespace-nowrap p-3">{money(Number(s.monthly_salary || 0))}</td>
                  <td className="hidden whitespace-nowrap p-3 md:table-cell">{s.join_date}</td>
                  <td className="hidden p-3 sm:table-cell">
                    {(s.status ?? "active") === "active" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="px-2 sm:px-3"
                      onClick={() => {
                        setOpenPay(s);
                        setPayForm(newPayForm(Number(s.monthly_salary || 0)));
                      }}
                    >
                      <Wallet className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">Pay</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-1"
                      onClick={() => openEditStaff(s)}
                      aria-label={`Edit ${s.name}`}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteStaffRow(s)} aria-label={`Remove ${s.name}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    {staff.length === 0 ? "No staff yet" : "No staff match your filters"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={staffPage} total={filteredStaff.length} onChange={setStaffPage} />
        </div>
        )}
      </Card>

      {/* ---------- Salary payments ---------- */}
      <Card className="overflow-hidden p-0">
        <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-2 px-3 sm:flex-nowrap ${paysOpen ? "pt-3" : "py-2"}`}>
          <div className="font-medium">Salary payments</div>
          {/* Total + slips drop to their own row on small screens */}
          <div className="order-last flex w-full items-center justify-between gap-3 text-xs text-muted-foreground sm:order-none sm:ml-auto sm:w-auto sm:justify-end">
            <span className="whitespace-nowrap">
              Total: <span className="font-semibold text-foreground">{money(filteredPaysTotal)}</span>
            </span>
            <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={slipsForFiltered} disabled={!filteredPays.length}>
              <FileDown className="mr-1 h-3 w-3" />
              <span className="hidden sm:inline">Download slips</span>
              <span className="sm:hidden">Slips</span> ({filteredPays.length})
            </Button>
          </div>
          <SectionToggle open={paysOpen} onToggle={() => setPaysOpen((o) => !o)} controls="salary-payments-body" label="salary payments" />
        </div>

        {paysOpen && (
        <div id="salary-payments-body">

        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:flex-nowrap lg:items-center">
          <SearchBox value={payQ} onChange={setPayQ} placeholder="Search staff or notes" className="w-full lg:min-w-0 lg:flex-1" />
          <Select value={payStaff} onValueChange={setPayStaff}>
            <SelectTrigger className="h-8 w-full shrink-0 lg:w-32"><SelectValue placeholder="Staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={payRole} onValueChange={setPayRole}>
            <SelectTrigger className="h-8 w-full shrink-0 capitalize lg:w-32"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={payMode} onValueChange={setPayMode}>
            <SelectTrigger className="h-8 w-full shrink-0 lg:w-36"><SelectValue placeholder="Mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              {PAYMENT_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex shrink-0 items-center gap-1">
            <Input type="date" value={payFrom} onChange={(e) => setPayFrom(e.target.value)} className="h-8 w-full lg:w-[8.5rem]" aria-label="From date" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={payTo} onChange={(e) => setPayTo(e.target.value)} className="h-8 w-full lg:w-[8.5rem]" aria-label="To date" />
          </div>
          {payFiltersActive && (
            <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2" onClick={clearPayFilters}>
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-xs">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 font-medium">Staff</th>
                <th className="px-3 py-1.5 font-medium">Mode</th>
                <th className="px-3 py-1.5 font-medium">Notes</th>
                <th className="px-3 py-1.5 text-right font-medium">Absent</th>
                <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                <th className="px-3 py-1.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payRows.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-1.5">{format(new Date(p.paid_on), "dd MMM yyyy")}</td>
                  <td className="truncate px-3 py-1.5 font-medium" title={staffById[p.staff_id]?.name || ""}>
                    {staffById[p.staff_id]?.name || "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                      {modeLabel(p.payment_mode)}
                    </Badge>
                  </td>
                  <td className="truncate px-3 py-1.5 text-muted-foreground" title={p.notes || ""}>
                    {p.notes || "—"}
                  </td>
                  {/* Absent: click to view the leave dates for this salary month */}
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {Number(p.deduction_amount) > 0 ? (
                      <button
                        type="button"
                        className="text-right text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => setLeavePay(p)}
                        aria-label={`View leave dates for ${staffById[p.staff_id]?.name || "staff"}`}
                        title="View leave dates"
                      >
                        <div className="font-medium">{p.absent_days}d</div>
                        <div className="text-[10px]">−{money(Number(p.deduction_amount))}</div>
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <div className="font-semibold">{money(Number(p.amount || 0))}</div>
                    {p.salary_month && (
                      <div className="text-[10px] text-muted-foreground">for {format(new Date(p.salary_month), "MMM yyyy")}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeletePay(p)}
                      aria-label={`Delete payment to ${staffById[p.staff_id]?.name || "staff"}`}
                      title="Delete payment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredPays.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    {pays.length === 0 ? "No payments recorded." : "No payments match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={payPage} total={filteredPays.length} onChange={setPayPage} />
        </div>
        )}
      </Card>

      <AttendanceDialog open={openAttendance} onOpenChange={setOpenAttendance} tenantId={tenantId} staff={staff} />
      <LeaveDetailsDialog payment={leavePay} staffName={staffById[leavePay?.staff_id]?.name || "Staff"} onClose={() => setLeavePay(null)} />

      <ConfirmDialog
        open={!!deletePay}
        title="Delete this payment?"
        busy={deleting}
        onCancel={() => setDeletePay(null)}
        onConfirm={confirmRemovePayment}
        description={
          deletePay && (
            <div className="space-y-1">
              <div className="flex justify-between gap-2">
                <span>Staff</span>
                <span className="font-medium text-foreground">{staffById[deletePay.staff_id]?.name || "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Amount</span>
                <span className="font-medium text-foreground">{money(Number(deletePay.amount || 0))}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Paid on</span>
                <span className="text-foreground">{format(new Date(deletePay.paid_on), "dd MMM yyyy")}</span>
              </div>
              {deletePay.salary_month && (
                <div className="flex justify-between gap-2">
                  <span>Salary month</span>
                  <span className="text-foreground">{format(new Date(deletePay.salary_month), "MMMM yyyy")}</span>
                </div>
              )}
              <p className="pt-1 text-xs">This cannot be undone.</p>
            </div>
          )
        }
      />

      <ConfirmDialog
        open={!!deleteStaffRow}
        title={`Remove ${deleteStaffRow?.name || "staff"}?`}
        confirmLabel="Yes, remove"
        busy={deleting}
        onCancel={() => setDeleteStaffRow(null)}
        onConfirm={confirmRemoveStaff}
        description="The staff record will be removed. This cannot be undone."
      />

      {/* ---------- Add / edit staff dialog ---------- */}
      <Dialog
        open={openAdd}
        onOpenChange={(o) => {
          setOpenAdd(o);
          if (!o) setEditingId(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-lg p-4 sm:w-full sm:p-5">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-6 text-base sm:text-lg">{editingId ? `Edit ${f.name || "staff"}` : "Add staff"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Role</Label>
                <Input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="waiter, chef…" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input type="tel" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10 digit phone number" />
              </div>
              <div>
                <Label>Monthly salary</Label>
                <Input type="number" value={f.monthly_salary} onChange={(e) => setF({ ...f, monthly_salary: e.target.value })} />
              </div>
              <div>
                <Label>Join date</Label>
                <Input type="date" value={f.join_date} onChange={(e) => setF({ ...f, join_date: e.target.value })} />
              </div>
              {editingId && (
                <div>
                  <Label>Status</Label>
                  <Select value={f.status || "active"} onValueChange={(v) => setF({ ...f, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {editingId && (
              <p className="text-xs text-muted-foreground">
                Changes apply to new payments. Payments already recorded keep their saved amounts.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button className="w-full sm:w-auto" onClick={saveStaff}>
              {editingId ? "Save changes" : "Add staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Pay dialog ---------- */}
      <Dialog open={!!openPay} onOpenChange={(o) => !o && setOpenPay(null)}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-md flex-col gap-3 overflow-hidden rounded-lg p-4 sm:w-full sm:p-5">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-6 text-base sm:text-lg">Pay {openPay?.name}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            {/* Joining-date proration */}
            {calc.eligible === 0 ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {openPay?.name} joined on {openPay?.join_date && format(new Date(openPay.join_date), "dd MMM yyyy")}, after this month. No
                salary is due for it.
              </div>
            ) : (
              calc.prorated && (
                <div className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm dark:border-sky-800 dark:bg-sky-950/40">
                  Joined on <b>{format(new Date(openPay.join_date), "dd MMM yyyy")}</b>, so salary is for{" "}
                  <b>
                    {calc.eligible} of {calc.days} days
                  </b>
                  : {calc.eligible} × {money(calc.perDay)} = <b>{money(calc.gross)}</b>
                </div>
              )
            )}

            {/* Attendance-based prompt */}
            {payAtt && (
              <div className="text-xs text-muted-foreground">
                Attendance: {payAtt.present} present · {payAtt.absent} absent · {payAtt.half_day} half day · {payAtt.leave} paid leave ·{" "}
                {Math.max(0, calc.eligible - payAtt.marked)} unmarked
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
                      amount: e.target.checked ? calc.net : calc.gross,
                    })
                  }
                />
                Deduct salary for absent days
              </label>

              {payForm.deduct && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Absent days</Label>
                      <Input
                        type="number"
                        min={0}
                        max={calc.eligible}
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
                      <span className="text-muted-foreground">{calc.prorated ? "Payable days" : "Days in month"}</span>
                      <span>{calc.prorated ? `${calc.eligible} of ${calc.days}` : calc.days}</span>
                    </div>
                    {calc.prorated && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Salary for payable days</span>
                        <span>{money(calc.gross)}</span>
                      </div>
                    )}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div className="flex shrink-0 justify-end border-t pt-3">
            <Button className="w-full sm:w-auto" onClick={requestPay} disabled={calc.eligible === 0 || confirmPay}>
              Record payment
            </Button>
          </div>

          {/* Yes / No confirmation */}
          {confirmPay && openPay && (
            <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto rounded-lg bg-background/85 p-4 backdrop-blur-sm sm:p-5">
              <div
                role="alertdialog"
                aria-labelledby="confirm-pay-title"
                aria-describedby="confirm-pay-desc"
                className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg"
              >
                <div id="confirm-pay-title" className="text-base font-semibold">
                  Record this payment?
                </div>
                <div id="confirm-pay-desc" className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Staff</span>
                    <span className="font-medium">{openPay.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Salary month</span>
                    <span>{format(new Date(`${payForm.salary_month}-01T00:00:00`), "MMMM yyyy")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mode</span>
                    <span>{modeLabel(payForm.payment_mode)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid on</span>
                    <span>{format(new Date(`${payForm.paid_on}T00:00:00`), "dd MMM yyyy")}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Amount</span>
                    <span>{money(Number(payForm.amount) || 0)}</span>
                  </div>
                </div>
                {payAtt && payAtt.deductible > 0 && !payForm.deduct && (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                    {openPay.name} has {payAtt.deductible} deductible day(s) in attendance, but no deduction is applied.
                  </div>
                )}
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" className="w-full sm:w-auto" autoFocus onClick={() => setConfirmPay(false)} disabled={paying}>
                    No
                  </Button>
                  <Button className="w-full sm:w-auto" onClick={paySalary} disabled={paying}>
                    {paying ? "Saving…" : "Yes, record"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}