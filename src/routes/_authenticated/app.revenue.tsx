import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { format, subDays } from "date-fns";
import { TrendingUp, PartyPopper } from "lucide-react";

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
  { key: "delivery", label: "Home delivery", bar: "bg-violet-500", swatch: "bg-violet-500" },
  { key: "booking", label: "Table bookings", bar: "bg-rose-500", swatch: "bg-rose-500" },
  { key: "event", label: "Events", bar: "bg-emerald-500", swatch: "bg-emerald-500" },
  { key: "other", label: "Other", bar: "bg-slate-400", swatch: "bg-slate-400" },
] as const;

type ChannelKey = (typeof CHANNELS)[number]["key"];

// order_type is written differently in different parts of the app ("dine-in",
// "DINE_IN", "Home Delivery"), so match on the stem instead of an exact value.
// Anything unrecognised lands in "other" rather than silently disappearing.
function channelOf(orderType?: string | null): ChannelKey {
  const t = (orderType || "").toLowerCase();
  if (t.includes("dine")) return "dine_in";
  if (t.includes("take") || t.includes("pick") || t.includes("counter")) return "takeaway";
  if (t.includes("deliver")) return "delivery";
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
  const [from, setFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();

    supabase
      .from("orders")
      .select("created_at,total,payment_status,order_type")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at")
      .then(({ data }) => setRows(data || []));

    // Events are dated by when they happen, not when they were booked: a party
    // booked in March for June belongs to June's takings, which is how it would
    // be read against that week's covers.
    supabase
      .from("event_bookings")
      .select("starts_at,amount,amount_paid,status,event_type,contact_name,guest_count")
      .in("status", EARNING_EVENT_STATUSES)
      .gte("starts_at", start)
      .lte("starts_at", end)
      .order("starts_at")
      .then(({ data }) => setEvents(data || []));
  }, [from, to]);

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

  // Channels that never appear in the selected range are dropped from the
  // legend, so a quiet week doesn't show five colours it never used.
  const activeChannels = CHANNELS.filter(c => byChannel[c.key] > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Revenue</h1>
      </div>

      <Card className="p-4 flex flex-wrap gap-4 items-end">
        <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Gross revenue</div>
          <div className="text-2xl font-semibold mt-1">{money(total)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {money(orderTotal)} orders · {money(eventTotal)} events
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Collected</div>
          <div className="text-2xl font-semibold mt-1">{money(paid)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {money(orderPaid)} orders · {money(eventPaid)} advances
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className="text-2xl font-semibold mt-1">{money(outstanding)}</div>
          <div className="text-xs text-muted-foreground mt-1">Unpaid bills and event balances</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Volume</div>
          <div className="text-2xl font-semibold mt-1">{rows.length}</div>
          <div className="text-xs text-muted-foreground mt-1">
            orders · {events.length} {events.length === 1 ? "event" : "events"}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="font-medium">Daily revenue</div>
          {activeChannels.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {activeChannels.map(c => (
                <div key={c.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-sm ${c.swatch}`} aria-hidden="true" />
                  <span>{c.label}</span>
                  <span className="font-medium text-foreground">{money(byChannel[c.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {byDay.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">Nothing in this range.</div>
        )}

        <div className="space-y-2">
          {byDay.map(([d, v]) => {
            const parts = CHANNELS.filter(c => v.split[c.key] > 0);
            // Read out as one sentence so the split isn't colour-only.
            const breakdown = parts
              .map(c => `${c.label} ${money(v.split[c.key])}`)
              .join(", ");
            return (
              <div key={d} className="flex items-center gap-3 text-sm">
                <div className="w-24 text-muted-foreground">{format(new Date(d), "PP")}</div>
                <div className="flex-1 h-2.5 bg-muted rounded overflow-hidden">
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
                <div className="w-24 text-right font-medium">{money(v.revenue)}</div>
                <div className="w-20 text-right text-xs text-muted-foreground">
                  {v.orders} ord{v.events > 0 ? ` · ${v.events} ev` : ""}
                </div>
                <span className="sr-only">
                  {format(new Date(d), "PP")}: {money(v.revenue)} — {breakdown}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {events.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 font-medium mb-3">
            <PartyPopper className="h-4 w-4" />
            Events in this range
          </div>
          <div className="space-y-2">
            {events.map((e, i) => {
              const due = Number(e.amount || 0) - Number(e.amount_paid || 0);
              return (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="w-24 text-muted-foreground text-xs">
                    {format(new Date(e.starts_at), "PP")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{e.contact_name}</span>
                    <span className="text-xs text-muted-foreground"> · {e.event_type} · {e.guest_count} guests</span>
                  </div>
                  <div className="text-right font-medium w-24">{money(e.amount)}</div>
                  <div className={`text-right text-xs w-24 ${due > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {due > 0 ? `${money(due)} due` : "settled"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}