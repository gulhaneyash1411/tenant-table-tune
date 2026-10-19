import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Shared pieces for the multi-outlet admin pages (organizations, outlets, subscriptions, invoices, ...). */

export const ADMIN_PAGE_SIZE = 10;

/** Debounce a fast-changing value (search boxes) so each keystroke isn't a query. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Escape characters that have meaning in a PostgREST `.or()`/`ilike` filter value. */
export const likeTerm = (s: string) => s.trim().replace(/[%,()*]/g, " ").replace(/\s+/g, " ");

/** Server-side pagination footer: pass the 1-based page and the total row count. */
export function Pager({
  page, total, pageSize = ADMIN_PAGE_SIZE, onPage,
}: { page: number; total: number; pageSize?: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-sm text-muted-foreground">
      <span>{total === 0 ? "No results" : `${from}–${to} of ${total}`}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2">Page {page} of {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

type Tone = "green" | "amber" | "red" | "blue" | "grey";
const TONE: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/15 text-red-700 dark:text-red-400",
  blue: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  grey: "bg-muted text-muted-foreground",
};

const STATUS_TONE: Record<string, [Tone, string]> = {
  // outlet_status
  ACTIVE: ["green", "Active"],
  PENDING_PAYMENT: ["amber", "Pending payment"],
  SUSPENDED: ["red", "Suspended"],
  CANCELLED: ["grey", "Cancelled"],
  // subscriptions (stored lowercase)
  active: ["green", "Active"],
  trialing: ["blue", "Trial"],
  scheduled: ["blue", "Scheduled"],
  paused: ["red", "Suspended"],
  canceled: ["grey", "Cancelled"],
  expired: ["red", "Expired"],
  past_due: ["amber", "Past due"],
  EXPIRING: ["amber", "Expiring"],
  // invoices
  draft: ["grey", "Draft"],
  issued: ["blue", "Issued"],
  pending: ["amber", "Pending"],
  pending_approval: ["amber", "Awaiting approval"],
  paid: ["green", "Paid"],
  partially_paid: ["amber", "Partially paid"],
  overdue: ["red", "Overdue"],
  cancelled: ["grey", "Cancelled"],
  rejected: ["red", "Rejected"],
  free_trial: ["blue", "Free trial"],
  // payments / generic
  completed: ["green", "Completed"],
  failed: ["red", "Failed"],
  refunded: ["grey", "Refunded"],
  approved: ["green", "Approved"],
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const [tone, label] = STATUS_TONE[status] ?? ["grey", status.replace(/_/g, " ")];
  return <Badge variant="secondary" className={`${TONE[tone]} border-0 font-medium`}>{label}</Badge>;
}

export const BUSINESS_TYPE_LABEL: Record<string, string> = {
  SINGLE_OUTLET: "Single restaurant",
  MULTI_OUTLET: "Multi-outlet",
};

export const fmtMoney = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Calls a SECURITY DEFINER admin RPC and turns a failure into a thrown Error. */
export async function adminRpc<T = unknown>(
  client: { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
