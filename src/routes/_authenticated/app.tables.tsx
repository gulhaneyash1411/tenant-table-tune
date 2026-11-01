import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentOutlet } from "@/lib/outlet-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QRCard } from "@/components/qr-card";
import { useTenantContext } from "@/hooks/use-session";
import { planAllows } from "@/config/plan-features";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { format, isToday, isTomorrow } from "date-fns";
import { Download, Plus, RefreshCw, Users, Clock, Phone, Pencil, PartyPopper, UtensilsCrossed, IndianRupee } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/tables")({ component: TablesPage });

// A dine-in table is occupied for the whole service. Payment alone does not
// free it: QR guests pay up front, so a prepaid order would release the tile
// while the food is still being cooked and the guests are still sitting there.
// A table is free only once its order is both served and settled — see the
// filter in loadOrders, which these statuses feed.
const OPEN_ORDER_STATUSES = ["new", "preparing", "ready", "served"] as const;

// How long a booking blocks the table around its start time. The lead is so
// staff stop seating walk-ins shortly before the party arrives; the hold is how
// long the table waits for a late party before it counts as free again.
// This must match the interval inside the table_reservation_hold SQL function,
// or a guest scanning the QR and the host looking at this screen will disagree.
const HOLD_LEAD_MINUTES = 60;

// How far ahead bookings are fetched. Wide on purpose: a window narrower than
// the date picker allows means a booking saves successfully and then never
// appears, which reads as "it didn't save" and is impossible to diagnose from
// the UI. Only raise the ceiling on the picker if you narrow this.
const LOOKAHEAD_DAYS = 60;

// Pins the native date/time picker button to the right edge of its field.
// Firefox ignores the pseudo-element entirely and Safari draws its own control,
// so this is a Chrome/Edge refinement, not a cross-browser guarantee.
const PICKER_ICON =
  "[&::-webkit-calendar-picker-indicator]:absolute " +
  "[&::-webkit-calendar-picker-indicator]:right-3 " +
  "[&::-webkit-calendar-picker-indicator]:top-1/2 " +
  "[&::-webkit-calendar-picker-indicator]:-translate-y-1/2 " +
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer " +
  "[&::-webkit-calendar-picker-indicator]:opacity-60 " +
  "hover:[&::-webkit-calendar-picker-indicator]:opacity-100";

const PHONE_LEN = 10;
const sanitisePhone = (v: string) => v.replace(/\D/g, "").slice(0, PHONE_LEN);
const isPhoneValid = (v: string) => v.length === PHONE_LEN;

type TableStatus = "busy" | "reserved" | "free";

const STATUS_STYLES: Record<TableStatus, { label: string; tile: string; dot: string }> = {
  busy: {
    label: "Busy",
    tile: "border-red-500/50 bg-red-500/10 hover:bg-red-500/15",
    dot: "bg-red-500",
  },
  reserved: {
    label: "Reserved",
    tile: "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15",
    dot: "bg-amber-500",
  },
  free: {
    label: "Free",
    tile: "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10",
    dot: "bg-emerald-500",
  },
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Arrivals stay listed for two months back, so a past day's count can be read.
function lookbackStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 60);
  return d.toISOString();
}

function lookaheadEnd() {
  const d = new Date();
  d.setDate(d.getDate() + LOOKAHEAD_DAYS);
  return d.toISOString();
}

/** Is this booking holding the table right now? */
function isHoldingNow(r: any, now = Date.now()) {
  const start = new Date(r.reserved_for).getTime();
  return now >= start - HOLD_LEAD_MINUTES * 60_000
    && now <= start + (r.hold_minutes ?? 90) * 60_000;
}

/** The window a booking occupies: its start until its hold runs out. */
function bookingWindow(startMs: number, holdMinutes: number) {
  return [startMs, startMs + (holdMinutes || 90) * 60_000] as const;
}

/**
 * Does a proposed booking collide with an existing one on the same table?
 *
 * Half-open comparison: a booking ending at 8:00 and one starting at 8:00 do
 * not overlap, so back-to-back sittings are allowed. This mirrors the '[)'
 * range bound in the table_reservations_no_overlap database constraint — the
 * two must agree, or the UI accepts something the database then rejects.
 */
function overlapsExisting(startMs: number, holdMinutes: number, existing: any[]) {
  const [aStart, aEnd] = bookingWindow(startMs, holdMinutes);
  return existing.find(r => {
    const [bStart, bEnd] = bookingWindow(new Date(r.reserved_for).getTime(), r.hold_minutes);
    return aStart < bEnd && bStart < aEnd;
  }) || null;
}

/** "Today, 8:00 PM" reads faster on a busy pass than a full date does. */
function whenLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "p")}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, "p")}`;
  return format(d, "d MMM, p");
}

/** "Sat 4 Oct" from a yyyy-mm-dd key. Parsed at local midnight, because a bare
 *  yyyy-mm-dd is read as UTC and can print the day before. */
function dayLabel(key: string) {
  return format(new Date(`${key}T00:00`), "EEE d MMM");
}

// Durations are stored in minutes but taken and shown in hours — staff quote
// "three hours", not "180 minutes". Half-hour steps cover every real booking.
const DURATION_STEP_HOURS = 0.5;
const DEFAULT_DURATION_HOURS = 3;

function hoursLabel(minutes: number) {
  const h = (minutes || 0) / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? "hour" : "hours"}`;
}

// Bookings are taken on the quarter hour, so the form works in 15-minute steps
// rather than to the minute.
const SLOT_MINUTES = 15;

/** Local calendar date as yyyy-mm-dd. Not toISOString, which converts to UTC
 *  and lands on the wrong day either side of midnight. */
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function timeKey(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The next bookable moment at or after `from`, rounded up to a slot. */
function nextSlot(from = new Date()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  const over = d.getMinutes() % SLOT_MINUTES;
  d.setMinutes(d.getMinutes() + (over === 0 ? SLOT_MINUTES : SLOT_MINUTES - over));
  return d;
}

function defaultDate() {
  return dateKey(nextSlot());
}
function defaultTime() {
  return timeKey(nextSlot());
}

const emptyForm = () => ({
  guest_name: "",
  guest_phone: "",
  party_size: 2,
  date: defaultDate(),
  time: defaultTime(),
  hold_minutes: 90,
  notes: "",
});

// An event books the room, not a table, so it carries what the kitchen and the
// floor need to prepare rather than a seat number.
const EVENT_TYPES = [
  { value: "birthday", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "corporate", label: "Corporate" },
  { value: "party", label: "Private party" },
  { value: "other", label: "Other" },
] as const;

const EVENT_STATUSES = [
  { value: "enquiry", label: "Enquiry", tone: "bg-amber-500/15 text-amber-700" },
  { value: "confirmed", label: "Confirmed", tone: "bg-emerald-500/15 text-emerald-700" },
  { value: "completed", label: "Completed", tone: "bg-muted text-muted-foreground" },
  { value: "cancelled", label: "Cancelled", tone: "bg-muted text-muted-foreground line-through" },
] as const;

const emptyEventForm = () => ({
  contact_name: "",
  contact_phone: "",
  event_type: "birthday",
  guest_count: 10,
  // Blank rather than 0, so the field reads as unanswered instead of as a free
  // event — a required field pre-filled with a valid value gets skipped.
  amount: "",
  amount_paid: "",
  date: defaultDate(),
  time: defaultTime(),
  duration_hours: DEFAULT_DURATION_HOURS,
  food_requirements: "",
  notes: "",
});

// The asterisk is aria-hidden and paired with aria-required on the input: the
// visual marker is for sighted users, the attribute is what a screen reader
// announces, so the requirement isn't stated twice.
function RequiredMark() {
  return <span className="text-red-500" aria-hidden>*</span>;
}

function TablesPage() {
  const { plan: ownerPlan } = useTenantContext();
  const [tenant, setTenant] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  // table id -> its secure QR token and status (see qr_codes)
  const [qrs, setQrs] = useState<Record<string, { token: string; status: string }>>({});
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  // Parties already seated today. Kept apart from `reservations`, which only
  // holds booked rows: a seated party must stop holding its table on the floor
  // but still appear in today's record.
  const [seatedRows, setSeatedRows] = useState<any[]>([]);
  // The day the arrivals list shows. Defaults to today.
  const [arrivedDate, setArrivedDate] = useState(() => dateKey(new Date()));
  const [label, setLabel] = useState("Table ");
  const [seats, setSeats] = useState(4);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogTable, setDialogTable] = useState<any>(null);
  const [form, setForm] = useState(emptyForm());
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  // Non-null while an existing booking is being edited rather than a new one
  // taken; the same form serves both, so this is what decides insert vs update.
  const [editingId, setEditingId] = useState<string | null>(null);

  const [events, setEvents] = useState<any[]>([]);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState<any>(emptyEventForm());
  const [eventTouched, setEventTouched] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  // Set once the date clash has been shown and the save re-attempted: the first
  // tap raises the question, the second answers it.
  const [clashAck, setClashAck] = useState(false);

  // Narrows the Bookings tab — the table bookings and the events below them —
  // to one day. "" means no filter, i.e. the whole lookahead window. A single
  // date rather than a range: the question staff actually ask is "what's on
  // tomorrow", and a range picker is two more taps for the same answer.
  const [filterDate, setFilterDate] = useState("");

  // Re-renders on a timer so a booking's hold window opens and closes on its
  // own — no data changes when a reservation simply becomes due.
  // The value is used, not just the setter: `floor` is
  // memoised on data that doesn't change as time passes, so without `tick` in
  // their dependencies a tile would sit on Free straight through its booking
  // time and only flip when something else forced a recompute.
  const [tick, setTick] = useState(0);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    // 30s rather than 60s so a tile turns amber within half a minute of its
    // hold opening, instead of up to a minute late.
    const id = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const loadOrders = useCallback(async (tenantId: string) => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, table_id, status, created_at, order_number, total, payment_status")
      .eq("tenant_id", tenantId)
      .eq("order_type", "dine_in")
      .in("status", OPEN_ORDER_STATUSES)
      .gte("created_at", startOfToday())
      // An order keeps its table until it is BOTH served and paid. Filtering on
      // payment alone frees the table the moment a QR guest pays up front, with
      // the food still in the kitchen — which is how a table in Preparing came
      // to show as Free. `payment_status.is.null` is listed explicitly because
      // NULL <> 'paid' evaluates to NULL in Postgres, not true, so an unpaid
      // order with a null column would otherwise drop out of this result.
      .or("status.neq.served,payment_status.is.null,payment_status.neq.paid");

    if (error) {
      console.warn("Floor plan could not read orders:", error.message);
      return;
    }
    setOpenOrders(data || []);
  }, []);

  const loadReservations = useCallback(async (tenantId: string) => {
    const { data, error } = await supabase
      .from("table_reservations")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("status", ["booked", "seated"])
      .gte("reserved_for", lookbackStart())
      .lte("reserved_for", lookaheadEnd())
      .order("reserved_for");

    if (error) {
      // Silence here is what makes a missing table or a bad policy look like
      // "bookings just don't save" — say so instead.
      console.error("Could not read reservations:", error.code, error.message);
      toast.error(`Bookings unavailable: ${error.message}`);
      return;
    }
    const rows = data || [];
    const today = new Date(startOfToday());
    setReservations(rows.filter((r: any) => r.status === "booked" && new Date(r.reserved_for) >= today));
    setSeatedRows(rows.filter((r: any) => r.status === "seated"));
  }, []);

  const loadEvents = useCallback(async (tenantId: string) => {
    // Cancelled and completed events stay in the list — an enquiry that fell
    // through is still worth seeing when the same caller rings back.
    const { data, error } = await supabase
      .from("event_bookings")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("starts_at", startOfToday())
      .order("starts_at");

    if (error) {
      console.error("Could not read events:", error.code, error.message);
      toast.error(`Events unavailable: ${error.message}`);
      return;
    }
    setEvents(data || []);
  }, []);

  const loadTables = useCallback(async (tenantId: string) => {
    const { data } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("label");
    setTables(data || []);
    const { data: qrRows } = await (supabase as any)
      .from("qr_codes").select("table_id,token,status").eq("tenant_id", tenantId);
    setQrs(Object.fromEntries((qrRows ?? []).map((q: any) => [q.table_id, { token: q.token, status: q.status }])));
  }, []);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const t = await fetchCurrentOutlet(u.user!.id);
    setTenant(t);
    if (!t) return;
    await Promise.all([loadTables(t.id), loadOrders(t.id), loadReservations(t.id), loadEvents(t.id)]);
  }, [loadTables, loadOrders, loadReservations, loadEvents]);

  useEffect(() => { load(); }, [load]);

  // The orders board writes status and payment_status; this listens for both so
  // a table turns green the moment an order is served and settled there.
  useEffect(() => {
    if (!tenant?.id) return;
    const ch = supabase
      .channel("floor-plan-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadOrders(tenant.id))
      // Bookings are usually taken on a different device from the one showing
      // the floor — the host's phone at the door, the screen at the pass — so
      // this listens for them rather than trusting the local write alone.
      .on("postgres_changes", { event: "*", schema: "public", table: "table_reservations" }, () => loadReservations(tenant.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenant?.id, loadOrders, loadReservations]);

  async function refreshFloor() {
    if (!tenant?.id) return;
    setRefreshing(true);
    await Promise.all([loadOrders(tenant.id), loadReservations(tenant.id), loadEvents(tenant.id)]);
    setRefreshing(false);
  }

  async function add() {
    // "Table " with no number is not a usable label
    if (!label.trim() || label.trim() === "Table" || !tenant) return;
    // Table limit from the owner's plan (blank in the plan form = unlimited)
    const maxTables = ownerPlan?.max_tables;
    if (maxTables != null && tables.length >= maxTables) {
      return toast.error(`Your plan allows up to ${maxTables} tables. Upgrade to add more.`);
    }
    // Same table number can't exist twice; the existing one must be deleted first
    const clean = label.trim();
    if (tables.some(t => String(t.label).trim().toLowerCase() === clean.toLowerCase())) {
      return toast.error(`${clean} already exists. Delete the existing table first to re-create it.`);
    }
    const { error } = await supabase
      .from("restaurant_tables")
      .insert({ tenant_id: tenant.id, label, seats });
    if (error) return toast.error(error.message);
    toast.success(`${clean} added — its QR code is generated`);
    setLabel("Table ");
    load();
  }

  async function regenerateQr(tableId: string) {
    const { error } = await (supabase as any).rpc("regenerate_table_qr", { p_table_id: tableId });
    if (error) return toast.error(error.message);
    toast.success("New QR generated — the old printed QR no longer works");
    if (tenant?.id) loadTables(tenant.id);
  }

  async function setQrStatus(tableId: string, status: "ACTIVE" | "REVOKED") {
    const { error } = await (supabase as any).rpc("set_table_qr_status", { p_table_id: tableId, p_status: status });
    if (error) return toast.error(error.message);
    toast.success(status === "ACTIVE" ? "QR enabled" : "QR disabled — guests can't order with it");
    if (tenant?.id) loadTables(tenant.id);
  }


  // One A4 PDF with every table's QR (token URL), 2 x 3 per page.
  async function downloadAllQrPdf() {
    try {
      const { downloadQrPdf } = await import("@/lib/qr-pdf");
      await downloadQrPdf(
        tables
          .filter(t => qrs[t.id]?.status !== "REVOKED")
          .map(t => ({
            label: t.label,
            seats: t.seats,
            url: qrs[t.id] ? `${origin}/order/${qrs[t.id].token}` : `${origin}/t/${t.id}`,
          })),
        `${(tenant?.name ?? "tables").replace(/\s+/g, "-")}-table-qr-codes.pdf`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create PDF");
    }
  }

  async function removeTable(id: string) {
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Table QR deleted");
    load();
  }

  // ---- Reservations --------------------------------------------------------
  // Name, phone, party size, date and time are all required. The phone is what
  // staff use to chase a late party, so a booking without one isn't much of a
  // booking; only the notes are genuinely optional.

  const nameValid = form.guest_name.trim().length >= 2;
  const phoneValid = isPhoneValid(form.guest_phone);
  const partyValid = Number(form.party_size) >= 1;
  // A booking in the past can't hold anything — isHoldingNow would already have
  // expired the moment it was saved — so it's rejected rather than stored as a
  // row that quietly does nothing.
  const reservedAt = form.date && form.time ? new Date(`${form.date}T${form.time}`) : null;
  const whenParsed = !!reservedAt && !Number.isNaN(reservedAt.getTime());
  const whenInPast = whenParsed && reservedAt.getTime() < Date.now();
  const whenValid = whenParsed && !whenInPast;

  // The same table can't be held for two parties at once. This reads from
  // `reservations`, which only ever holds rows with status "booked", so a
  // cancelled or seated booking correctly frees its slot again. It is a
  // courtesy check, not the guarantee — two staff booking the same slot at the
  // same moment both pass it, and the database constraint is what stops them.
  const clash = whenValid && dialogTable
    ? overlapsExisting(
        reservedAt!.getTime(),
        Number(form.hold_minutes) || 90,
        // A booking can't clash with itself while being edited.
        reservations.filter(r => r.table_id === dialogTable.id && r.id !== editingId),
      )
    : null;

  const formValid = nameValid && phoneValid && partyValid && whenValid && !clash;

  // The native picker's own floor. Blocking past dates in the widget is worth
  // doing even with the check above — it stops the mistake instead of scolding
  // after the fact — but it is not the guard, since the field can still be
  // typed into and the page can sit open past midnight. Recomputed from `tick`
  // so the floor keeps moving while the dialog sits open.
  const earliest = useMemo(() => nextSlot(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const minDate = dateKey(earliest);
  // Only clamp the clock when the chosen day is today; on any later day every
  // time is still ahead of now.
  const minTime = form.date === minDate ? timeKey(earliest) : undefined;

  /**
   * Changing the date can strand a time that was fine on the old date — pick
   * tomorrow at 9am, then switch back to today at 6pm, and 09:00 is suddenly in
   * the past. Rather than leaving an invalid value for the save to reject, the
   * time is pulled forward to the next bookable slot.
   */
  function onDateChange(next: string) {
    const stranded = next === minDate && form.time < minTime!;
    setForm({ ...form, date: next, time: stranded ? minTime! : form.time });
  }

  /** Jumps both fields to the soonest slot that can still be booked. */
  function useNextSlot() {
    setForm({ ...form, date: dateKey(earliest), time: timeKey(earliest) });
  }

  function openDialog(t: any) {
    setForm(emptyForm());
    setTouched(false);
    setEditingId(null);
    setDialogTable(t);
  }

  /** Opens the same dialog with an existing booking loaded for editing. */
  function openEditDialog(r: any) {
    const at = new Date(r.reserved_for);
    setForm({
      guest_name: r.guest_name ?? "",
      guest_phone: r.guest_phone ?? "",
      party_size: r.party_size ?? 2,
      date: dateKey(at),
      time: timeKey(at),
      hold_minutes: r.hold_minutes ?? 90,
      notes: r.notes ?? "",
    });
    setTouched(false);
    setEditingId(r.id);
    setDialogTable(tables.find(t => t.id === r.table_id) ?? { id: r.table_id, label: "—" });
  }

  async function saveReservation() {
    if (!dialogTable || !tenant) return;
    setTouched(true);
    if (clash) {
      return toast.error(
        `${dialogTable.label} is already held for ${clash.guest_name} at ${whenLabel(clash.reserved_for)}`,
      );
    }
    if (!formValid) return toast.error("Fill in the required fields");

    const payload = {
      guest_name: form.guest_name.trim(),
      guest_phone: form.guest_phone,
      party_size: Number(form.party_size),
      reserved_for: new Date(`${form.date}T${form.time}`).toISOString(),
      hold_minutes: Number(form.hold_minutes) || 90,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    // .select().single() returns the stored row either way, so the list shows
    // the real record — with its database id and any trigger-set columns like
    // ends_at — rather than a guess at what was written.
    const { data: saved, error } = editingId
      ? await supabase
          .from("table_reservations")
          .update(payload)
          .eq("id", editingId)
          .select()
          .single()
      : await supabase
          .from("table_reservations")
          .insert({ ...payload, tenant_id: tenant.id, table_id: dialogTable.id })
          .select()
          .single();
    setSaving(false);

    if (error) {
      // The code matters more than the message when this fails: 42P01 means the
      // table was never created, 42501 means RLS rejected the write, and 23P01
      // is the overlap constraint — someone took this slot in the seconds since
      // this dialog last loaded, which the local check can't see.
      console.error("Reservation save failed:", error.code, error.message, error.details);
      if (error.code === "23P01") {
        await loadReservations(tenant.id);
        return toast.error("That slot was just taken — pick another time.");
      }
      return toast.error(`${error.code ?? "Error"}: ${error.message}`);
    }

    // Applied to state directly instead of waiting on the refetch. If a booking
    // ever does fall outside the fetch window, it still shows up here, and the
    // refetch below reconciles against what the database actually holds.
    setReservations(prev =>
      [...prev.filter(r => r.id !== saved.id), saved]
        .sort((a, b) => a.reserved_for.localeCompare(b.reserved_for)),
    );

    toast.success(
      editingId
        ? `Booking updated for ${form.guest_name.trim()}`
        : `${dialogTable.label} booked for ${form.guest_name.trim()}`,
    );
    setForm(emptyForm());
    setTouched(false);
    setEditingId(null);
    // Closed on success: the booking is done, and on a phone the dialog covers
    // the whole screen, so leaving it open hides the very list that confirms
    // the save worked. The toast carries the confirmation out.
    setDialogTable(null);
    await loadReservations(tenant.id);
  }

  // ---- Event bookings ------------------------------------------------------
  // Not tied to a table: an event takes the room, or enough of it that seating
  // is decided on the day. No overlap check for the same reason — two parties
  // on one evening is a call for staff, not the software.

  const eventAt = eventForm.date && eventForm.time
    ? new Date(`${eventForm.date}T${eventForm.time}`)
    : null;
  const eventWhenValid = !!eventAt && !Number.isNaN(eventAt.getTime()) && eventAt.getTime() >= Date.now();
  // Amount is required and must be a real figure; the advance is optional but
  // can't exceed it, which is also enforced by a check constraint so a second
  // screen can't write something inconsistent.
  const amountNum = Number(eventForm.amount);
  const paidNum = Number(eventForm.amount_paid || 0);
  const amountValid = eventForm.amount !== "" && Number.isFinite(amountNum) && amountNum > 0;
  const paidValid = Number.isFinite(paidNum) && paidNum >= 0 && (!amountValid || paidNum <= amountNum);

  // Taken in hours, stored in minutes. The field holds whatever is typed, so
  // this is what turns it into a number worth saving.
  const durationHours = Number(eventForm.duration_hours);
  const durationValid = Number.isFinite(durationHours) && durationHours >= DURATION_STEP_HOURS;

  const eventValid =
    eventForm.contact_name.trim().length >= 2
    && isPhoneValid(eventForm.contact_phone)
    && Number(eventForm.guest_count) >= 1
    && amountValid
    && paidValid
    && durationValid
    && eventWhenValid;

  // What else is already on the chosen date. Cancelled events don't count —
  // the room is free again — and an event being edited can't clash with itself.
  // This is a warning, not a rule: whether two functions fit is a call for
  // staff, so the save is gated on an acknowledgement rather than blocked.
  const sameDayEvents = useMemo(
    () => (eventForm.date
      ? events.filter(e =>
          e.id !== editingEventId
          && e.status !== "cancelled"
          && dateKey(new Date(e.starts_at)) === eventForm.date)
      : []),
    [events, eventForm.date, editingEventId],
  );

  /** Any date change puts the question back — the new day may be clear, or may
   *  clash with something else entirely. */
  function onEventDateChange(next: string) {
    setEventForm({ ...eventForm, date: next });
    setClashAck(false);
  }

  function openEventDialog(e?: any) {
    if (e) {
      const at = new Date(e.starts_at);
      setEventForm({
        contact_name: e.contact_name ?? "",
        contact_phone: e.contact_phone ?? "",
        event_type: e.event_type ?? "birthday",
        guest_count: e.guest_count ?? 10,
        amount: e.amount != null ? String(e.amount) : "",
        amount_paid: e.amount_paid != null ? String(e.amount_paid) : "",
        date: dateKey(at),
        time: timeKey(at),
        duration_hours: (e.duration_minutes ?? 180) / 60,
        food_requirements: e.food_requirements ?? "",
        notes: e.notes ?? "",
      });
      setEditingEventId(e.id);
    } else {
      setEventForm(emptyEventForm());
      setEditingEventId(null);
    }
    setEventTouched(false);
    setClashAck(false);
    setEventOpen(true);
  }

  async function saveEvent() {
    if (!tenant) return;
    setEventTouched(true);
    if (!eventValid) return toast.error("Fill in the required fields");

    // Stops here the first time only. The panel in the dialog names what's
    // already booked; this turns the button into an explicit "yes, anyway".
    if (sameDayEvents.length > 0 && !clashAck) {
      setClashAck(true);
      return toast.warning(
        `${sameDayEvents.length === 1 ? "An event is" : `${sameDayEvents.length} events are`} already booked on ${dayLabel(eventForm.date)} — tap Book anyway to continue.`,
      );
    }

    const payload = {
      contact_name: eventForm.contact_name.trim(),
      contact_phone: eventForm.contact_phone,
      event_type: eventForm.event_type,
      guest_count: Number(eventForm.guest_count),
      amount: amountNum,
      amount_paid: paidNum,
      starts_at: eventAt!.toISOString(),
      // Rounded to whole minutes: 2.5 hours is 150, and the column is an int.
      duration_minutes: Math.round(durationHours * 60),
      food_requirements: eventForm.food_requirements.trim() || null,
      notes: eventForm.notes.trim() || null,
    };

    setSaving(true);
    const { data: saved, error } = editingEventId
      ? await supabase.from("event_bookings").update(payload).eq("id", editingEventId).select().single()
      : await supabase.from("event_bookings").insert({ ...payload, tenant_id: tenant.id }).select().single();
    setSaving(false);

    if (error) {
      console.error("Event save failed:", error.code, error.message, error.details);
      return toast.error(`${error.code ?? "Error"}: ${error.message}`);
    }

    setEvents(prev =>
      [...prev.filter(e => e.id !== saved.id), saved]
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    );
    toast.success(editingEventId ? "Event updated" : `${eventForm.contact_name.trim()}'s event booked`);
    setEventOpen(false);
    setEditingEventId(null);
    setEventTouched(false);
    setClashAck(false);
    await loadEvents(tenant.id);
  }

  /**
   * Records the balance as received in full.
   *
   * Writes amount_paid = amount rather than adding to it, so a double tap is
   * harmless — the second one sets the same value instead of overpaying. It
   * also can't break the amount_paid <= amount check constraint.
   */
  async function settleEvent(e: any) {
    const { data, error } = await supabase
      .from("event_bookings")
      .update({ amount_paid: e.amount })
      .eq("id", e.id)
      .select()
      .single();

    if (error) {
      console.error("Settle failed:", error.code, error.message);
      return toast.error(error.message);
    }

    setEvents(prev => prev.map(x => (x.id === data.id ? data : x)));
    toast.success(`${money(e.amount)} received in full from ${e.contact_name}`);
    if (tenant?.id) await loadEvents(tenant.id);
  }

  async function setEventStatus(e: any, status: string) {
    const { error } = await supabase.from("event_bookings").update({ status }).eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success(`Event marked ${status}`);
    if (tenant?.id) await loadEvents(tenant.id);
  }

  // Cancelled and seated bookings both stop holding the table; keeping them as
  // rows rather than deleting means the day's no-shows are still countable.
  async function setReservationStatus(r: any, status: "cancelled" | "seated") {
    const { error } = await supabase
      .from("table_reservations")
      .update({ status })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(status === "seated" ? `${r.guest_name} arrived` : "Reservation cancelled");
    if (tenant?.id) await loadReservations(tenant.id);
  }

  const floor = useMemo(() => {
    const ordersByTable = new Map<string, any[]>();
    for (const o of openOrders) {
      if (!o.table_id) continue;
      ordersByTable.set(o.table_id, [...(ordersByTable.get(o.table_id) || []), o]);
    }
    const bookingsByTable = new Map<string, any[]>();
    for (const r of reservations) {
      bookingsByTable.set(r.table_id, [...(bookingsByTable.get(r.table_id) || []), r]);
    }

    const now = Date.now();
    return tables
      .filter(t => t.is_active !== false)
      .map(t => {
        const orders = ordersByTable.get(t.id) || [];
        const bookings = bookingsByTable.get(t.id) || [];
        const holding = bookings.find(r => isHoldingNow(r, now)) || null;
        const upcoming = bookings.filter(r => new Date(r.reserved_for).getTime() > now);

        const status: TableStatus = orders.length > 0 ? "busy" : holding ? "reserved" : "free";
        const since = orders.reduce<string | null>(
          (acc, o) => (!acc || o.created_at < acc ? o.created_at : acc),
          null,
        );
        // Only what is still owed. Prepaid orders now stay in this list until
        // they are served, so summing every open order would show money due on
        // a table that has already paid.
        const due = orders.reduce(
          (sum, o) => (o.payment_status === "paid" ? sum : sum + Number(o.total || 0)),
          0,
        );
        return { ...t, status, orders, orderCount: orders.length, since, due, holding, upcoming, bookings };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, openOrders, reservations, tick]);

  const counts = useMemo(
    () => ({
      busy: floor.filter(t => t.status === "busy").length,
      reserved: floor.filter(t => t.status === "reserved").length,
      free: floor.filter(t => t.status === "free").length,
    }),
    [floor],
  );

  // ---- Date filter ---------------------------------------------------------
  // One filter drives both lists on this tab: "what's on Saturday" means the
  // tables and the function room together, and two separate filters would let
  // the two halves of the answer disagree.

  // Recomputed from `tick` so the Today button and the picker's floor stay
  // correct on a screen left open overnight — at 00:30, Today is the new day.
  const todayKey = useMemo(() => dateKey(new Date()), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Matched on the local calendar date, not on the ISO string: an 8pm booking
  // is stored as UTC and a string prefix would put it on the following day.
  const visibleEvents = useMemo(
    () => (filterDate
      ? events.filter(e => dateKey(new Date(e.starts_at)) === filterDate)
      : events),
    [events, filterDate],
  );

  const filterLabel = filterDate ? dayLabel(filterDate) : null;

  // Parties that arrived on the chosen day, with table labels, in booking order.
  const seatedList = useMemo(() => {
    const labels = new Map(tables.map(t => [t.id, t.label]));
    return seatedRows
      .filter(r => dateKey(new Date(r.reserved_for)) === arrivedDate)
      .sort((a, b) => new Date(a.reserved_for).getTime() - new Date(b.reserved_for).getTime())
      .map(r => ({ ...r, tableLabel: labels.get(r.table_id) ?? "—" }));
  }, [seatedRows, arrivedDate, tables]);
  const seatedGuests = seatedList.reduce((sum, r) => sum + Number(r.party_size || 0), 0);

  // Table bookings listed under the floor plan tiles, soonest first.
  const floorBookings = useMemo(() => {
    const labels = new Map(tables.map(t => [t.id, t.label]));
    return [...reservations]
      .sort((a, b) => new Date(a.reserved_for).getTime() - new Date(b.reserved_for).getTime())
      .map(r => ({ ...r, tableLabel: labels.get(r.table_id) ?? "—" }));
  }, [reservations, tables]);

  // Kept in sync with the floor so the dialog reflects a save without being
  // handed fresh props — it's opened with a table, not a snapshot.
  const dialogRow = dialogTable ? floor.find(t => t.id === dialogTable.id) : null;

  // Delivery config lives in tenants.settings; the QR is only useful once the
  // owner has turned delivery on, so the card says so rather than printing a
  // code that lands on a "delivery is paused" screen.
  const settings = (tenant?.settings && typeof tenant.settings === "object" ? tenant.settings : {}) as Record<string, any>;
  const deliveryEnabled = settings.delivery_enabled !== false;

  // Tabs the owner's plan includes (QR codes / Floor plan / Bookings)
  const tableTabs = [
    { value: "qr", label: "QR codes", feature: "tables_qr" },
    { value: "floor", label: "Floor plan", feature: "floor_plan" },
    { value: "bookings", label: "Event Booking", feature: "bookings" },
  ].filter((t) => planAllows(ownerPlan?.features, t.feature));

  return (
    <div className="space-y-6">
      <Tabs defaultValue={tableTabs[0]?.value ?? "qr"} className="space-y-6">
        {/* Underline rather than the default pill: these switch the whole page,
            so the bar reads as navigation. shadcn's TabsList carries its own
            background, padding and rounding, and TabsTrigger its own active
            pill — all of it has to be nulled out here, not just added to.
            overflow-x-auto matters on a 360px screen: a fourth tab would wrap
            into a second row and shift everything below it. */}
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0 overflow-x-auto">
          {tableTabs.map(t => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="relative rounded-none border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:text-foreground"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ---------------------------------------------------------- QR tab */}
        <TabsContent value="qr" className="space-y-6">
          {tenant && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Counter &amp; outreach codes</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <QRCard
                  url={`${origin}/review?t=${tenant.id}`}
                  title="Feedback QR"
                  subtitle="Universal review code — one per counter."
                />
                <QRCard
                  url={`${origin}/takeaway/${tenant.id}`}
                  title="Takeaway QR"
                  subtitle="Walk-in guests scan to place a parcel order."
                />
                <QRCard
                  url={`${origin}/delivery/${tenant.id}`}
                  title="Home Delivery QR"
                  subtitle={
                    deliveryEnabled
                      ? "Print on flyers and packaging — guests order from home."
                      : "Turn delivery on in Settings before printing this code."
                  }
                />
              </div>
            </section>
          )}

          <Card className="p-4 flex flex-wrap gap-2 items-end">
            <div>
              <Label htmlFor="tbl-label">Table label</Label>
              <Input id="tbl-label" value={label}
                // "Table " is fixed and only digits may follow it: any edit that removes
                // the prefix (backspace, cut, select-all + type) puts it back, and letters are dropped
                onChange={e => setLabel("Table " + e.target.value.replace(/^Table ?/, "").replace(/\D/g, ""))}
                placeholder="Table 1"
              />
            </div>
            <div>
              <Label htmlFor="tbl-seats">Seats</Label>
              <Input
                id="tbl-seats"
                type="number"
                value={seats}
                onChange={e => setSeats(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add table</Button>
            <Button variant="outline" onClick={downloadAllQrPdf} disabled={tables.length === 0}>
              <Download className="h-4 w-4 mr-1" />Download all QRs (PDF)
            </Button>
          </Card>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {tables.map(t => (
              <QRCard
                key={t.id}
                // Secure token URL; the id-based /t/{id} link is only a fallback
                // while a QR row hasn't loaded.
                url={qrs[t.id] ? `${origin}/order/${qrs[t.id].token}` : `${origin}/t/${t.id}`}
                title={t.label}
                subtitle={`${t.seats} seats`}
                onDelete={() => removeTable(t.id)}
              />
            ))}
          </div>
        </TabsContent>

        {/* -------------------------------------------------- Floor plan tab */}
        <TabsContent value="floor" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {(Object.keys(STATUS_STYLES) as TableStatus[]).map(s => (
                <span key={s} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                  {STATUS_STYLES[s].label}
                  <span className="text-muted-foreground">{counts[s]}</span>
                </span>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={refreshFloor} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {floor.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No tables yet. Add one in the QR codes tab and it shows up here.
            </Card>
          ) : (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {floor.map(t => {
                const style = STATUS_STYLES[t.status as TableStatus];
                const isBusy = t.status === "busy";
                const nextUp = t.upcoming[0];
                return (
                  <button
                    key={t.id}
                    onClick={() => openDialog(t)}
                    aria-label={`${t.label}, ${style.label}. Open bookings`}
                    className={`rounded-lg border p-4 text-left transition-colors ${style.tile} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-lg font-semibold">{t.label}</span>
                      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${style.dot}`} />
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {t.seats} seats
                    </div>

                    <div className="mt-3 text-sm font-medium">{style.label}</div>

                    {/* "open orders", not "unpaid": a prepaid order still holds
                        the table, so the count and the money are separate facts
                        now. */}
                    {isBusy && (
                      <div className="text-xs text-muted-foreground">
                        {t.orderCount} open {t.orderCount === 1 ? "order" : "orders"}
                        {t.due > 0 ? ` · ${money(t.due)} due` : " · paid"}
                        {t.since ? ` · since ${format(new Date(t.since), "p")}` : ""}
                      </div>
                    )}

                    {t.status === "reserved" && t.holding && (
                      <div className="text-xs text-muted-foreground">
                        {t.holding.guest_name} · {t.holding.party_size} guests
                        <br />
                        {/* Both ends of the hold: "from 8:00" alone doesn't
                            tell a host when the table comes back if the party
                            never shows. */}
                        {format(new Date(t.holding.reserved_for), "p")} –{" "}
                        {format(
                          new Date(new Date(t.holding.reserved_for).getTime() + (t.holding.hold_minutes ?? 90) * 60_000),
                          "p",
                        )}
                      </div>
                    )}

                    {t.status === "free" && nextUp && (
                      <div className="text-xs text-muted-foreground">
                        Next: {nextUp.guest_name}, {whenLabel(nextUp.reserved_for)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Every table booking, not only the table that was tapped, so the
              floor plan answers "who is coming" on its own. */}
          <div className="space-y-2 pt-2">
            <h2 className="text-sm font-medium">Table bookings</h2>
            {floorBookings.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No table bookings. Tap a table above to take a reservation.
              </Card>
            ) : (
              floorBookings.map(r => (
                <Card key={r.id} className={`p-3 ${isHoldingNow(r, Date.now()) ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="sm:w-40 shrink-0">
                      <div className="text-sm font-semibold">{whenLabel(r.reserved_for)}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.tableLabel} · holds {r.hold_minutes} min
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{r.guest_name}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{r.party_size}</span>
                        <a href={`tel:${r.guest_phone}`} className="flex items-center gap-1 hover:underline">
                          <Phone className="h-3 w-3" />{r.guest_phone}
                        </a>
                      </div>
                      {r.notes && <p className="text-xs mt-1">{r.notes}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="h-8 text-xs flex-1 sm:flex-none" onClick={() => openEditDialog(r)}>
                        <Pencil className="h-3 w-3 sm:mr-1" />
                        <span className="sm:inline">Edit</span>
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs flex-1 sm:flex-none" onClick={() => setReservationStatus(r, "seated")}>
                        Mark arrived
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs flex-1 sm:flex-none" onClick={() => setReservationStatus(r, "cancelled")}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* The day's record: a party moves here when it is seated, so the
              count of tables used today is still there after the floor frees up. */}
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">
                {arrivedDate === dateKey(new Date()) ? "Arrived today" : `Arrived on ${dayLabel(arrivedDate)}`} · {seatedList.length}{" "}
                {seatedList.length === 1 ? "party" : "parties"}, {seatedGuests} guests
              </h2>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="Show arrivals on this date"
                  value={arrivedDate}
                  onChange={e => setArrivedDate(e.target.value)}
                  className={`h-8 w-[9.5rem] relative ${PICKER_ICON}`}
                />
                <Button size="sm" variant="outline" className="h-8" onClick={() => setArrivedDate(dateKey(new Date()))}>
                  Today
                </Button>
              </div>
            </div>
            {seatedList.length === 0 ? (
              <Card className="p-4 text-center text-sm text-muted-foreground">
                {arrivedDate === dateKey(new Date()) ? "No parties arrived yet today." : `No parties arrived on ${dayLabel(arrivedDate)}.`}
              </Card>
            ) : (
              seatedList.map(r => (
                <Card key={r.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.guest_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700">Arrived</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {r.tableLabel} · {r.party_size} guests · booked for {whenLabel(r.reserved_for)}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            A table stays busy until its order is marked served on the Live orders page and the bill is settled. Tap any table to book it or see who's expected.
          </p>
        </TabsContent>

        {/* ---------------------------------------------------- Bookings tab */}
        <TabsContent value="bookings" className="space-y-3">
          {/* The filter sits with the count it changes, and covers the events
              list further down too — staff ask about a day, not about a list. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {filterDate
                ? `${visibleEvents.length} ${visibleEvents.length === 1 ? "event" : "events"} on ${filterLabel}.`
                : `${events.length} ${events.length === 1 ? "event" : "events"} booked.`}
            </p>

            <div className="flex flex-wrap gap-2">
              <Input
                type="date"
                aria-label="Show bookings and events on this date"
                value={filterDate}
                min={todayKey}
                onChange={e => setFilterDate(e.target.value)}
                className={`h-9 w-[9.5rem] relative ${PICKER_ICON}`}
              />
              {/* Today is the day asked for constantly, so it gets a button
                  rather than three taps of the picker. Tapping it again clears. */}
              <Button
                size="sm"
                variant={filterDate === todayKey ? "default" : "outline"}
                onClick={() => setFilterDate(filterDate === todayKey ? "" : todayKey)}
              >
                Today
              </Button>
              {filterDate && (
                <Button size="sm" variant="ghost" onClick={() => setFilterDate("")}>
                  Clear
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={refreshFloor} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                
              </Button>
              <Button size="sm" onClick={() => openEventDialog()}>
                <PartyPopper className="h-4 w-4 mr-1" />
                New event
              </Button>              
            </div>
          </div>

          {/* Events sit below the table bookings rather than mixed in: they run
              to a different rhythm — enquiry, confirm, deposit — and staff scan
              the table list many times a service but the event list once. */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">
                Events{filterLabel ? ` · ${filterLabel}` : ""}
              </h2>
              <span className="text-xs text-muted-foreground">
                {visibleEvents.filter(e => e.status === "enquiry").length} awaiting confirmation
              </span>
            </div>

            {visibleEvents.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                {filterDate
                  ? `No events on ${filterLabel}.`
                  : "No events booked. Use New event for a birthday, party or function."}
              </Card>
            ) : (
              <div className="space-y-2">
                {visibleEvents.map(e => {
                  const badge = EVENT_STATUSES.find(s => s.value === e.status);
                  const typeLabel = EVENT_TYPES.find(t => t.value === e.event_type)?.label ?? e.event_type;
                  return (
                    <Card key={e.id} className="p-3">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                        <div className="sm:w-40 shrink-0">
                          <div className="text-sm font-semibold">{whenLabel(e.starts_at)}</div>
                          <div className="text-xs text-muted-foreground">
                            {typeLabel} · {hoursLabel(e.duration_minutes)}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{e.contact_name}</span>
                            {badge && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.tone}`}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{e.guest_count} guests</span>
                            <a href={`tel:${e.contact_phone}`} className="flex items-center gap-1 hover:underline">
                              <Phone className="h-3 w-3" />{e.contact_phone}
                            </a>
                            {/* Balance rather than just the total: it's the
                                number anyone asks about when the guest calls. */}
                            <span className="font-medium text-foreground">{money(e.amount)}</span>
                            {Number(e.amount) - Number(e.amount_paid) > 0 ? (
                              <span className="text-amber-600 font-medium">
                                {money(Number(e.amount) - Number(e.amount_paid))} due
                              </span>
                            ) : (
                              <span className="text-emerald-600">paid in full</span>
                            )}
                          </div>
                          {e.food_requirements && (
                            <p className="text-xs flex items-start gap-1">
                              <UtensilsCrossed className="h-3 w-3 mt-0.5 shrink-0" />
                              {e.food_requirements}
                            </p>
                          )}
                          {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                        </div>

                        <div className="flex flex-wrap gap-2 shrink-0">
                          {/* Settling the balance is the action most likely to
                              be wanted on a row that still owes, so it leads
                              and carries the figure — no need to read it off
                              the line above before tapping. */}
                          {Number(e.amount) - Number(e.amount_paid) > 0 && e.status !== "cancelled" && (
                            <Button size="sm" className="h-8 text-xs" onClick={() => settleEvent(e)}>
                              <IndianRupee className="h-3 w-3 mr-1" />
                              Paid in full
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEventDialog(e)}>
                            <Pencil className="h-3 w-3 mr-1" />Edit
                          </Button>
                          {e.status === "enquiry" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEventStatus(e, "confirmed")}>
                              Confirm
                            </Button>
                          )}
                          {e.status === "confirmed" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEventStatus(e, "completed")}>
                              Mark done
                            </Button>
                          )}
                          {e.status !== "cancelled" && (
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEventStatus(e, "cancelled")}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------- Booking dialog */}
      <Dialog
        open={!!dialogTable}
        onOpenChange={open => {
          if (!open) { setDialogTable(null); setEditingId(null); }
        }}
      >
        {/* Nearly full-bleed on a phone with its own scroll area, a centred
            panel from sm up. The width is set here rather than left to the
            component default, which is too wide for a 360px screen. */}
        {/* max-w matters as much as w here: the shadcn default carries its own
            max-width and horizontal translate, and without overriding both the
            panel can sit wider than the viewport on a 360px screen and clip its
            right edge. overscroll-contain stops a scroll that reaches the end
            of the dialog from dragging the page behind it. */}
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {dialogRow?.label} · {dialogRow?.seats} seats
            </DialogTitle>
          </DialogHeader>

          {dialogRow?.status === "busy" && (
            <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm">
              Guests are seated here now — {dialogRow.orderCount} open{" "}
              {dialogRow.orderCount === 1 ? "order" : "orders"}
              {dialogRow.due > 0 ? `, ${money(dialogRow.due)} still due` : ", paid in full"}.
              A booking made now will still hold the table from its start time.
            </div>
          )}

          {/* Existing bookings first: the commonest reason to open this dialog is
              to check who's coming or to seat a party that just arrived. */}
          {dialogRow && dialogRow.bookings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Booked for this table</h3>
              {dialogRow.bookings.map((r: any) => (
                <div key={r.id} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-medium">{r.guest_name}</span>
                    <span className="text-xs text-muted-foreground">{whenLabel(r.reserved_for)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{r.party_size}</span>
                    <a href={`tel:${r.guest_phone}`} className="flex items-center gap-1 hover:underline">
                      <Phone className="h-3 w-3" />{r.guest_phone}
                    </a>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />holds {r.hold_minutes} min</span>
                  </div>
                  {r.notes && <p className="text-xs">{r.notes}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEditDialog(r)}>
                      <Pencil className="h-3 w-3 mr-1" />Edit
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setReservationStatus(r, "seated")}>
                      Mark arrived
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setReservationStatus(r, "cancelled")}>
                      Cancel booking
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 pt-3 border-t">
            <h3 className="text-sm font-medium">{editingId ? "Edit booking" : "New booking"}</h3>

            {/* One column on a phone — two fields side by side put a date
                picker and a time picker at about 150px each, which is not
                enough to tap reliably. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="res-name">Guest name <RequiredMark /></Label>
                <Input
                  id="res-name"
                  value={form.guest_name}
                  onChange={e => setForm({ ...form, guest_name: e.target.value })}
                  placeholder="Who the table is held for"
                  aria-required="true"
                  aria-invalid={touched && !nameValid}
                  className="h-11"
                />
                {touched && !nameValid && <p className="text-[11px] text-red-500">Enter at least 2 characters</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="res-phone">Phone <RequiredMark /></Label>
                <Input
                  id="res-phone"
                  value={form.guest_phone}
                  onChange={e => setForm({ ...form, guest_phone: sanitisePhone(e.target.value) })}
                  type="tel"
                  inputMode="numeric"
                  maxLength={PHONE_LEN}
                  placeholder={`${PHONE_LEN}-digit mobile`}
                  aria-required="true"
                  aria-invalid={touched && !phoneValid}
                  className="h-11"
                />
                {touched && !phoneValid && <p className="text-[11px] text-red-500">Must be {PHONE_LEN} digits</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="res-party">Guests <RequiredMark /></Label>
                <Input
                  id="res-party"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={form.party_size}
                  onChange={e => setForm({ ...form, party_size: Number(e.target.value) })}
                  aria-required="true"
                  aria-invalid={touched && !partyValid}
                  className="h-11"
                />
                {touched && !partyValid && <p className="text-[11px] text-red-500">At least 1 guest</p>}
              </div>

              {/* WebKit renders the picker button immediately after the value
                  text, which leaves it floating mid-field. Taking it out of
                  flow and pinning it right puts it where a trailing affordance
                  belongs and gives it a bigger tap target. */}
              <div className="space-y-1">
                <Label htmlFor="res-date">Date <RequiredMark /></Label>
                <Input
                  id="res-date"
                  type="date"
                  value={form.date}
                  min={minDate}
                  onChange={e => onDateChange(e.target.value)}
                  aria-required="true"
                  aria-invalid={touched && !whenValid}
                  className={`h-11 w-full relative ${PICKER_ICON}`}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="res-time">Time <RequiredMark /></Label>
                  {/* Most bookings taken at the door are for right now, and
                      that's the one time the guest never has to be asked. */}
                  <button
                    type="button"
                    onClick={useNextSlot}
                    className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Soonest ({timeKey(earliest)})
                  </button>
                </div>
                <Input
                  id="res-time"
                  type="time"
                  value={form.time}
                  min={minTime}
                  // Steps the field by quarter hours, matching how slots are
                  // actually taken; without it the arrows move a minute at a
                  // time and the picker offers every one of them.
                  step={SLOT_MINUTES * 60}
                  onChange={e => setForm({ ...form, time: e.target.value })}
                  aria-required="true"
                  aria-invalid={touched && !whenValid}
                  className={`h-11 w-full relative ${PICKER_ICON}`}
                />
                {touched && !whenValid && (
                  <p className="text-[11px] text-red-500">
                    {whenInPast ? "That time has already passed" : "Pick a valid date and time"}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="res-hold">Hold for (minutes)</Label>
                <Input
                  id="res-hold"
                  type="number"
                  min={15}
                  step={15}
                  inputMode="numeric"
                  value={form.hold_minutes}
                  onChange={e => setForm({ ...form, hold_minutes: Number(e.target.value) })}
                  className="h-11"
                />
              </div>

              {/* Shown as soon as the times collide rather than waiting for a
                  save attempt — the hold length is part of what causes a clash,
                  so the warning has to react to this field too. */}
              {clash && (
                <div className="sm:col-span-2 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm">
                  Already held for <span className="font-medium">{clash.guest_name}</span> at{" "}
                  {whenLabel(clash.reserved_for)} ({clash.hold_minutes} min). Pick another time, or
                  cancel that booking above.
                </div>
              )}

              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="res-notes">Requirements</Label>
                <textarea
                  id="res-notes"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Birthday cake, wheelchair access, no nuts…"
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>

            {/* Full-width stacked buttons on a phone; the primary action sits
                last in the DOM so it's the nearest to the thumb. */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <Button variant="outline" className="h-11 sm:h-10" onClick={() => setDialogTable(null)} disabled={saving}>
                Close
              </Button>
              <Button className="h-11 sm:h-10" onClick={saveReservation} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Book table"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------- Event dialog */}
      <Dialog open={eventOpen} onOpenChange={open => { setEventOpen(open); if (!open) setEditingEventId(null); }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {editingEventId ? "Edit event" : "New event booking"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="ev-name">Contact name <RequiredMark /></Label>
              <Input
                id="ev-name"
                value={eventForm.contact_name}
                onChange={e => setEventForm({ ...eventForm, contact_name: e.target.value })}
                placeholder="Who's organising it"
                aria-required="true"
                className="h-11"
              />
              {eventTouched && eventForm.contact_name.trim().length < 2 && (
                <p className="text-[11px] text-red-500">Enter at least 2 characters</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="ev-phone">Phone <RequiredMark /></Label>
              <Input
                id="ev-phone"
                value={eventForm.contact_phone}
                onChange={e => setEventForm({ ...eventForm, contact_phone: sanitisePhone(e.target.value) })}
                type="tel"
                inputMode="numeric"
                maxLength={PHONE_LEN}
                placeholder={`${PHONE_LEN}-digit mobile`}
                aria-required="true"
                className="h-11"
              />
              {eventTouched && !isPhoneValid(eventForm.contact_phone) && (
                <p className="text-[11px] text-red-500">Must be {PHONE_LEN} digits</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="ev-type">Occasion <RequiredMark /></Label>
              {/* A plain select rather than a styled component: it's five fixed
                  options, and the native control is the better picker on a
                  phone. */}
              <select
                id="ev-type"
                value={eventForm.event_type}
                onChange={e => setEventForm({ ...eventForm, event_type: e.target.value })}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ev-guests">Guests <RequiredMark /></Label>
              <Input
                id="ev-guests"
                type="number"
                min={1}
                inputMode="numeric"
                value={eventForm.guest_count}
                onChange={e => setEventForm({ ...eventForm, guest_count: Number(e.target.value) })}
                aria-required="true"
                className="h-11"
              />
              {eventTouched && Number(eventForm.guest_count) < 1 && (
                <p className="text-[11px] text-red-500">At least 1 guest</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="ev-amount">Package amount <RequiredMark /></Label>
              <Input
                id="ev-amount"
                type="number"
                min={1}
                step="0.01"
                inputMode="decimal"
                value={eventForm.amount}
                onChange={e => setEventForm({ ...eventForm, amount: e.target.value })}
                placeholder="Total agreed"
                aria-required="true"
                aria-invalid={eventTouched && !amountValid}
                className="h-11"
              />
              {eventTouched && !amountValid && (
                <p className="text-[11px] text-red-500">Enter the agreed amount</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="ev-paid">Advance received</Label>
              <Input
                id="ev-paid"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={eventForm.amount_paid}
                onChange={e => setEventForm({ ...eventForm, amount_paid: e.target.value })}
                placeholder="0"
                aria-invalid={eventTouched && !paidValid}
                className="h-11"
              />
              {eventTouched && !paidValid && (
                <p className="text-[11px] text-red-500">Can't be more than the package amount</p>
              )}
            </div>

            {/* Taken in hours because that's how a function is quoted on the
                phone; converted to minutes on save, so the stored column is
                unchanged and nothing else that reads the row has to know. */}
            <div className="space-y-1">
              <Label htmlFor="ev-duration">Runs for (hours)</Label>
              <Input
                id="ev-duration"
                type="number"
                min={DURATION_STEP_HOURS}
                step={DURATION_STEP_HOURS}
                inputMode="decimal"
                value={eventForm.duration_hours}
                onChange={e => setEventForm({ ...eventForm, duration_hours: e.target.value })}
                aria-invalid={eventTouched && !durationValid}
                className="h-11"
              />
              {eventTouched && !durationValid && (
                <p className="text-[11px] text-red-500">At least {DURATION_STEP_HOURS} hours</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="ev-date">Date <RequiredMark /></Label>
              <Input
                id="ev-date"
                type="date"
                value={eventForm.date}
                min={minDate}
                onChange={e => onEventDateChange(e.target.value)}
                aria-required="true"
                className={`h-11 w-full relative ${PICKER_ICON}`}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ev-time">Start time <RequiredMark /></Label>
              <Input
                id="ev-time"
                type="time"
                value={eventForm.time}
                min={eventForm.date === minDate ? minTime : undefined}
                step={SLOT_MINUTES * 60}
                onChange={e => setEventForm({ ...eventForm, time: e.target.value })}
                aria-required="true"
                className={`h-11 w-full relative ${PICKER_ICON}`}
              />
              {eventTouched && !eventWhenValid && (
                <p className="text-[11px] text-red-500">Pick a date and time in the future</p>
              )}
            </div>

            {/* Sits directly under the date that caused it, and lists what's
                there rather than just saying the day is taken — whether both
                fit depends on the times and the head counts. */}
            {sameDayEvents.length > 0 && (
              <div
                className={`sm:col-span-2 rounded-md border p-3 text-sm space-y-2 ${
                  clashAck ? "border-red-500/50 bg-red-500/5" : "border-amber-500/50 bg-amber-500/5"
                }`}
                role="status"
              >
                <p className="font-medium">
                  {sameDayEvents.length === 1
                    ? "An event is already booked"
                    : `${sameDayEvents.length} events are already booked`}{" "}
                  on {dayLabel(eventForm.date)}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {sameDayEvents.map(e => (
                    <li key={e.id}>
                      {format(new Date(e.starts_at), "p")} · {e.contact_name} · {e.guest_count} guests ·{" "}
                      {EVENT_TYPES.find(t => t.value === e.event_type)?.label ?? e.event_type}
                    </li>
                  ))}
                </ul>
                <p className="text-xs">
                  {clashAck
                    ? "Still want this one on the same day? Tap Book anyway."
                    : "Check the room and the kitchen can take both before saving."}
                </p>
              </div>
            )}

            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="ev-food">Food requirements</Label>
              <textarea
                id="ev-food"
                value={eventForm.food_requirements}
                onChange={e => setEventForm({ ...eventForm, food_requirements: e.target.value })}
                rows={3}
                placeholder="Set menu for 20, 6 Jain meals, egg-free cake…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="ev-notes">Other requirements</Label>
              <textarea
                id="ev-notes"
                value={eventForm.notes}
                onChange={e => setEventForm({ ...eventForm, notes: e.target.value })}
                rows={3}
                placeholder="Decorations, cake cutting at 9, projector, music…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <Button variant="outline" className="h-11 sm:h-10" onClick={() => setEventOpen(false)} disabled={saving}>
              Close
            </Button>
            {/* The label carries the confirmation: the same button that was
                refused a moment ago now says exactly what it will do. */}
            <Button className="h-11 sm:h-10" onClick={saveEvent} disabled={saving}>
              {saving
                ? "Saving…"
                : clashAck && sameDayEvents.length > 0
                  ? editingEventId ? "Save anyway" : "Book anyway"
                  : editingEventId ? "Save changes" : "Book event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}