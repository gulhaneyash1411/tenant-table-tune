import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { format, subDays, startOfMonth, differenceInCalendarDays } from "date-fns";
import { TrendingUp, PartyPopper, Wallet, Clock3, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/revenue")({ component: Revenue });

// An enquiry isn't revenue and a cancelled event never will be, so only these
// two statuses are counted. Keeping the rule in one place means the totals, the
// daily bars and the event list can't disagree about what's included.
const EARNING_EVENT_STATUSES = ["confirmed", "completed"];

// One list drives the stack order, the legend and the channel totals, so adding
// a channel later means editing this array and nothing else.
const CHANNELS = [
  { key: "dine_in", label: "Dine-in", bar: "bg-sky-500", swatch: "bg-sky-500" },
  { key: "takeaway", label: "Takeaway", bar: "bg-amber-500", swatch: "bg-amber-500" },
  { key: "booking", label: "Table bookings", bar: "bg-rose-500", swatch: "bg-rose-500" },
  { key: "event", label: "Events", bar: "bg-emerald-500", swatch: "bg-emerald-500" },
  { key: "other", label: "Other", bar: "bg-slate-400", swatch: "bg-slate-400" },
] as const;

type ChannelKey = (typeof CHANNELS)[number]["key"];

// The ranges a restaurant actually asks for. Each one is resolved at click time
// so "this month" still means this month after midnight.
const PRESETS = [
  { label: "7 days", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "30 days", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "This month", range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "90 days", range: () => ({ from: subDays(new Date(), 89), to: new Date() }) },
] as const;

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// Order types are written differently in different parts of the app, so match
// on the stem instead of an exact value. Anything unrecognised lands in "other".
function channelOf(orderType?: string | null): ChannelKey {
  const t = (orderType || "").toLowerCase();
  if (t.includes("dine")) return "dine_in";
  if (t.includes("take") || t.includes("pick") || t.includes("counter")) return "takeaway";
  if (t.includes("book") || t.includes("reserv")) return "booking";
  return "other";
}

const emptySplit = () =>
  Object.fromEntries(CHANNELS.map(c => [c.key, 0])) as Record<ChannelKey, number>;

type DayBucket = {
  revenue: number;
  paid: number;
  orders: number;
  events: number;
  split: Record<ChannelKey, number>;
};

function Revenue() {
  const { tenant } = useTenantContext();
  const [from, setFrom] = useState(iso(subDays(new Date(), 29)));
  const [to, setTo] = useState(iso(new Date()));
  const [rows, setRows] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A backwards range returns nothing from the database and reads like a bug,
  // so it's caught here and said out loud instead.
  const invalidRange = from > to;

  useEffect(() => {
    if (invalidRange || !tenant) return;

    // Changing the dates twice quickly used to leave whichever query finished
    // last on screen, even if it was the older one. This flag drops any reply
    // that arrives after the range has moved on.
    let current = true;
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();

    setLoading(true);
    setError(null);

    Promise.all([
      supabase
        .from("orders")
        .select("created_at,total,payment_status,order_type")
        .eq("tenant_id", tenant.id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at"),

      // Events are dated by when they happen, not when they were booked: a party
      // booked in March for June belongs to June's takings, which is how it would
      // be read against that week's covers.
      supabase
        .from("event_bookings")
        .select("starts_at,amount,amount_paid,status,event_type,contact_name,guest_count")
        .eq("tenant_id", tenant.id)
        .in("status", EARNING_EVENT_STATUSES)
        .gte("starts_at", start)
        .lte("starts_at", end)
        .order("starts_at"),
    ]).then(([orders, bookings]) => {
      if (!current) return;
      if (orders.error || bookings.error) {
        setError("Couldn't load revenue for this range. Try again in a moment.");
        setRows([]);
        setEvents([]);
      } else {
        setRows(orders.data || []);
        setEvents(bookings.data || []);
      }
      setLoading(false);
    });

    return () => {
      current = false;
    };
  }, [from, to, invalidRange, tenant]);

  const byDay = useMemo(() => {
    const m: Record<string, DayBucket> = {};
    const bucket = (d: string) =>
      (m[d] ||= { revenue: 0, paid: 0, orders: 0, events: 0, split: emptySplit() });

    for (const o of rows) {
      const v = bucket(format(new Date(o.created_at), "yyyy-MM-dd"));
      const amount = Number(o.total || 0);
      v.revenue += amount;
      if (o.payment_status === "paid") v.paid += amount;
      v.orders += 1;
      v.split[channelOf(o.order_type)] += amount;
    }
    for (const e of events) {
      const v = bucket(format(new Date(e.starts_at), "yyyy-MM-dd"));
      const amount = Number(e.amount || 0);
      v.revenue += amount;
      // Only the advance actually received counts as collected; the balance is
      // still owed even on a confirmed booking.
      v.paid += Number(e.amount_paid || 0);
      v.events += 1;
      v.split.event += amount;
    }
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, events]);

  // Range totals per channel, used for the legend so each colour carries a
  // number rather than only a name.
  const byChannel = useMemo(() => {
    const totals = emptySplit();
    for (const [, v] of byDay) {
      for (const c of CHANNELS) totals[c.key] += v.split[c.key];
    }
    return totals;
  }, [byDay]);

  const orderTotal = rows.reduce((a, b) => a + Number(b.total || 0), 0);
  const orderPaid = rows
    .filter(r => r.payment_status === "paid")
    .reduce((a, b) => a + Number(b.total || 0), 0);
  const eventTotal = events.reduce((a, b) => a + Number(b.amount || 0), 0);
  const eventPaid = events.reduce((a, b) => a + Number(b.amount_paid || 0), 0);

  const total = orderTotal + eventTotal;
  const paid = orderPaid + eventPaid;
  const outstanding = total - paid;
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v.revenue));

  // Counting what's still owed makes "outstanding" actionable: it's a number of
  // bills to chase, not only an amount.
  const unsettled =
    rows.filter(r => r.payment_status !== "paid").length +
    events.filter(e => Number(e.amount || 0) - Number(e.amount_paid || 0) > 0).length;

  const avgOrder = rows.length > 0 ? orderTotal / rows.length : 0;
  const days = Math.max(1, differenceInCalendarDays(new Date(to), new Date(from)) + 1);
  const perDay = total / days;

  // Channels that never appear in the selected range are dropped from the
  // legend, so a quiet week doesn't show five colours it never used.
  const activeChannels = CHANNELS.filter(c => byChannel[c.key] > 0);
  const activePreset = PRESETS.find(p => {
    const r = p.range();
    return iso(r.from) === from && iso(r.to) === to;
  });

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const r = p.range();
    setFrom(iso(r.from));
    setTo(iso(r.to));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(from), "PP")} – {format(new Date(to), "PP")} · {days}{" "}
          {days === 1 ? "day" : "days"}
        </p>
      </div>

      {/* A filter bar, not a section: small controls, labels inline, just
          enough padding to read as a card. */}
      <Card className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Presets first: most of the time nobody wants to pick two dates. */}
          <div role="group" aria-label="Quick ranges" className="flex flex-wrap gap-1">
            {PRESETS.map(p => {
              const active = activePreset?.label === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  aria-pressed={active}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="revenue-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="revenue-from"
                type="date"
                max={to}
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="h-8 w-auto px-2 py-0 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="revenue-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="revenue-to"
                type="date"
                min={from}
                value={to}
                onChange={e => setTo(e.target.value)}
                className="h-8 w-auto px-2 py-0 text-xs"
              />
            </div>
          </div>
        </div>

        {invalidRange && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            The start date is after the end date — nothing can fall in that range.
          </p>
        )}
      </Card>

      {error && (
        <Card role="alert" className="border-destructive/40 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      {/* A live region so the figures are announced once they settle, rather
          than changing silently underneath a screen reader. */}
      <div className="sr-only" role="status" aria-live="polite">
        {loading
          ? "Loading revenue"
          : `${money(total)} gross revenue, ${money(paid)} collected, ${money(outstanding)} outstanding`}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          loading={loading}
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          label="Gross revenue"
          value={money(total)}
          hint={`${money(orderTotal)} orders · ${money(eventTotal)} events`}
          foot={`${money(perDay)} a day on average`}
        />
        <Stat
          loading={loading}
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          label="Collected"
          value={money(paid)}
          hint={`${money(orderPaid)} orders · ${money(eventPaid)} advances`}
          foot={`${pct(paid, total)}% of gross`}
          // A thin rail reads faster than the percentage alone.
          meter={pct(paid, total)}
        />
        <Stat
          loading={loading}
          icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
          label="Outstanding"
          value={money(outstanding)}
          hint="Unpaid bills and event balances"
          foot={
            unsettled === 0
              ? "Everything settled"
              : `${unsettled} ${unsettled === 1 ? "item" : "items"} to chase`
          }
          tone={outstanding > 0 ? "warn" : "good"}
        />
        <Stat
          loading={loading}
          icon={<Receipt className="h-4 w-4" aria-hidden="true" />}
          label="Volume"
          value={`${rows.length} ${rows.length === 1 ? "order" : "orders"}`}
          hint={`${events.length} ${events.length === 1 ? "event" : "events"} in range`}
          foot={`${money(avgOrder)} average order`}
        />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="font-medium">Daily revenue</div>
          {activeChannels.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {activeChannels.map(c => (
                <li
                  key={c.key}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span className={`h-2.5 w-2.5 rounded-sm ${c.swatch}`} aria-hidden="true" />
                  <span>{c.label}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {money(byChannel[c.key])}
                  </span>
                  <span className="tabular-nums">{pct(byChannel[c.key], total)}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {loading && (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-2.5 flex-1 animate-pulse rounded bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {!loading && byDay.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">Nothing in this range.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a wider range — orders are dated when they're placed, events by when they run.
            </p>
          </div>
        )}

        {!loading && byDay.length > 0 && (
          <ul className="space-y-2">
            {byDay.map(([d, v]) => {
              const parts = CHANNELS.filter(c => v.split[c.key] > 0);
              const peak = v.revenue === maxDay && byDay.length > 1;
              // Read out as one sentence so the split isn't colour-only.
              const breakdown = parts.map(c => `${c.label} ${money(v.split[c.key])}`).join(", ");
              return (
                <li
                  key={d}
                  // On a phone the row wraps: date, amount and counts sit on one
                  // line and the bar takes the full width underneath.
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm sm:flex-nowrap"
                >
                  <div className="w-24 shrink-0 text-muted-foreground">
                    {format(new Date(d), "PP")}
                  </div>
                  <div
                    className="order-last h-2.5 w-full overflow-hidden rounded bg-muted sm:order-none sm:w-auto sm:flex-1"
                    aria-hidden="true"
                  >
                    {/* Outer width keeps days comparable; the segments inside
                        divide that day's own total between channels. */}
                    <div className="flex h-full" style={{ width: `${(v.revenue / maxDay) * 100}%` }}>
                      {parts.map(c => (
                        <div
                          key={c.key}
                          className={`h-full ${c.bar}`}
                          style={{ width: `${(v.split[c.key] / v.revenue) * 100}%` }}
                          title={`${c.label}: ${money(v.split[c.key])}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2 sm:ml-0">
                    {peak && (
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Peak
                      </span>
                    )}
                    <span className="w-24 text-right font-medium tabular-nums">
                      {money(v.revenue)}
                    </span>
                  </div>
                  <div className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                    {v.orders} ord{v.events > 0 ? ` · ${v.events} ev` : ""}
                  </div>
                  <span className="sr-only">
                    {format(new Date(d), "PP")}: {money(v.revenue)} — {breakdown}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!loading && events.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <PartyPopper className="h-4 w-4" aria-hidden="true" />
            Events in this range
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {money(eventTotal)} booked · {money(eventTotal - eventPaid)} due
            </span>
          </div>
          <ul className="space-y-2">
            {events.map((e, i) => {
              const due = Number(e.amount || 0) - Number(e.amount_paid || 0);
              return (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 text-sm last:border-0 last:pb-0"
                >
                  <div className="w-24 shrink-0 text-xs text-muted-foreground">
                    {format(new Date(e.starts_at), "PP")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{e.contact_name}</span>
                    <span className="block text-xs text-muted-foreground sm:inline">
                      <span className="hidden sm:inline"> · </span>
                      {e.event_type} · {e.guest_count} guests
                    </span>
                  </div>
                  <div className="w-24 text-right font-medium tabular-nums">{money(e.amount)}</div>
                  <div
                    className={`w-24 text-right text-xs tabular-nums ${
                      due > 0 ? "text-amber-600" : "text-emerald-600"
                    }`}
                  >
                    {due > 0 ? `${money(due)} due` : "settled"}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

// One card shape for all four figures, so the labels, spacing and skeletons
// stay in step instead of drifting apart card by card.
function Stat({
  icon,
  label,
  value,
  hint,
  foot,
  meter,
  tone,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  foot?: string;
  meter?: number;
  tone?: "warn" | "good";
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>

      {loading ? (
        <>
          <div className="mt-2 h-7 w-28 animate-pulse rounded bg-muted" aria-hidden="true" />
          <div className="mt-2 h-3 w-40 animate-pulse rounded bg-muted" aria-hidden="true" />
        </>
      ) : (
        <>
          <div
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : ""
            }`}
          >
            {value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          {typeof meter === "number" && (
            <div className="mt-2 h-1 overflow-hidden rounded bg-muted" aria-hidden="true">
              <div className="h-full bg-emerald-500" style={{ width: `${meter}%` }} />
            </div>
          )}
          {foot && <div className="mt-1.5 text-xs font-medium text-foreground/70">{foot}</div>}
        </>
      )}
    </Card>
  );
}