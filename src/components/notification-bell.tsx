import { useEffect, useRef, useState } from "react";
import {
  Bell, Volume2, VolumeX, X,
  UserPlus, BadgeCheck, Rocket, Star, AlertTriangle, CalendarPlus, PartyPopper,
  Clock, Flame, Timer, Receipt, IndianRupee, Gauge, BarChart3, ShieldAlert,
  MessageSquare, Megaphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const SOUND_PREF_KEY = "notif-sound-enabled";

// Anything older than this is not shown. The rows stay in the database; this is
// only how far back the panel reads.
const RETENTION_DAYS = 14;

// Each notification kind gets its own mark. Colours are set with an alpha fill
// so the same class works on the light and dark surface.
const KIND_STYLES: Record<string, { icon: LucideIcon; className: string }> = {
  tenant_signup:     { icon: UserPlus,      className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  tenant_status:     { icon: BadgeCheck,    className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  tenant_live:       { icon: Rocket,        className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  review_new:        { icon: Star,          className: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  review_low:        { icon: AlertTriangle, className: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  booking_new:       { icon: CalendarPlus,  className: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  booking_reminder:  { icon: Clock,         className: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  event_new:         { icon: PartyPopper,   className: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  order_stale:       { icon: Flame,         className: "bg-orange-500/12 text-orange-600 dark:text-orange-400" },
  trial_expiry:      { icon: Timer,         className: "bg-orange-500/12 text-orange-600 dark:text-orange-400" },
  invoice_pending:   { icon: Receipt,       className: "bg-orange-500/12 text-orange-600 dark:text-orange-400" },
  billing_digest:    { icon: IndianRupee,   className: "bg-orange-500/12 text-orange-600 dark:text-orange-400" },
  quota_warning:     { icon: Gauge,         className: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  platform_digest:   { icon: BarChart3,     className: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  kitchen_new_device:{ icon: ShieldAlert,   className: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  admin_message:     { icon: MessageSquare, className: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  announcement:      { icon: Megaphone,     className: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
};

const FALLBACK_STYLE = { icon: Bell, className: "bg-muted text-muted-foreground" };

export function NotificationBell() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_PREF_KEY) !== "false"; } catch { return true; }
  });
  const [announcement, setAnnouncement] = useState("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef(0);
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  // The panel hangs off the window's right corner, not off the bell — the bell
  // sits to the left of the sign-out button, so anchoring to it would leave the
  // panel short of the edge. We only borrow the bell's vertical position.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorTop, setAnchorTop] = useState(0);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setAnchorTop(r.bottom);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Unlock audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new Ctx();
        }
        audioCtxRef.current.resume();
      } catch {}
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  function playChime() {
    const ctx = audioCtxRef.current;
    if (!soundOnRef.current || !ctx || ctx.state !== "running") return;
    const now = Date.now();
    if (now - lastPlayedRef.current < 1500) return; // throttle bursts
    lastPlayedRef.current = now;

    const t = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  }

  function toggleSound() {
    setSoundOn((prev) => {
      const next = !prev;
      try { localStorage.setItem(SOUND_PREF_KEY, String(next)); } catch {}
      return next;
    });
  }

  async function load() {
    if (!userId) return;
    const since = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems(data || []);
  }
  useEffect(() => { if (userId) load(); }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("notif-" + userId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          playChime();
          const title = (payload.new as any)?.title;
          if (title) setAnnouncement(`New notification: ${title}`);
          load();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const unread = items.filter((n) => !n.is_read).length;
  const read = items.filter((n) => n.is_read);
  const unreadItems = items.filter((n) => !n.is_read);

  async function markAllRead() {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", userId).eq("is_read", false);
    load();
  }

  async function markOneRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  return (
    <>
      {/* Screen-reader announcement so sound isn't the only cue */}
      <div aria-live="polite" className="sr-only">{announcement}</div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            className="relative h-9 w-9 rounded-lg hover:bg-accent grid place-items-center"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium grid place-items-center">{unread}</span>}
          </button>
        </PopoverTrigger>

        {/* Zero-size reference pinned to the window's right edge. */}
        <PopoverAnchor asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed right-0 h-0 w-0"
            style={{ top: anchorTop }}
          />
        </PopoverAnchor>

        <PopoverContent
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border p-0 shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className="text-[15px] font-medium">Notifications</span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={toggleSound}
                aria-label={soundOn ? "Mute notification sound" : "Unmute notification sound"}
                aria-pressed={!soundOn}
              >
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Tabs defaultValue="unread" className="flex flex-col">
            <div className="flex items-center gap-2 px-4 pb-2">
              <TabsList className="h-8 rounded-full p-0.5">
                <TabsTrigger value="unread" className="h-7 rounded-full px-3 text-xs">
                  Unread{unread > 0 && <span className="ml-1.5 text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 py-px">{unread}</span>}
                </TabsTrigger>
                <TabsTrigger value="read" className="h-7 rounded-full px-3 text-xs">Read</TabsTrigger>
              </TabsList>
              {unread > 0 && (
                <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs rounded-full" onClick={markAllRead}>
                  Mark all read
                </Button>
              )}
            </div>

            <TabsContent value="unread" className="mt-0 max-h-[26rem] overflow-y-auto pb-2">
              <NotifList items={unreadItems} emptyLabel="You're all caught up." onItemClick={markOneRead} />
            </TabsContent>
            <TabsContent value="read" className="mt-0 max-h-[26rem] overflow-y-auto pb-2">
              <NotifList items={read} emptyLabel="No read notifications yet." />
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </>
  );
}

function NotifList({
  items,
  emptyLabel,
  onItemClick,
}: {
  items: any[];
  emptyLabel: string;
  onItemClick?: (id: string) => void;
}) {
  if (items.length === 0)
    return <div className="py-14 text-center text-sm text-muted-foreground">{emptyLabel}</div>;

  return (
    <div>
      {items.map((n) => {
        const { icon: Icon, className } = KIND_STYLES[n.kind] ?? FALLBACK_STYLE;
        const clickable = Boolean(onItemClick) && !n.is_read;
        return (
          <div
            key={n.id}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={() => clickable && onItemClick!(n.id)}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onItemClick!(n.id);
              }
            }}
            className={`flex gap-3 px-4 py-3 ${
              clickable ? "cursor-pointer hover:bg-accent/50" : "opacity-70"
            }`}
          >
            <div className={`h-9 w-9 shrink-0 rounded-full grid place-items-center ${className}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium leading-snug">{n.title}</div>
              {n.body && (
                <div className="text-[13px] text-muted-foreground leading-snug mt-0.5">{n.body}</div>
              )}
              <div className="text-[11px] text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </div>
            </div>
            {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
          </div>
        );
      })}
    </div>
  );
}
