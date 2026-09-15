import { useEffect, useRef, useState } from "react";
import { Bell, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const SOUND_PREF_KEY = "notif-sound-enabled";

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
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
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

      <button
        onClick={() => setOpen(true)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative h-9 w-9 rounded-lg hover:bg-accent grid place-items-center"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium grid place-items-center">{unread}</span>}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center justify-between">
              <span>Notifications</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSound}
                  aria-label={soundOn ? "Mute notification sound" : "Unmute notification sound"}
                  aria-pressed={!soundOn}
                >
                  {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                {unread > 0 && <Button variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>}
              </div>
            </SheetTitle>
          </SheetHeader>
          {/* Tabs block unchanged */}
          <Tabs defaultValue="unread" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-3 grid grid-cols-2">
              <TabsTrigger value="unread">Unread {unread > 0 && <span className="ml-1 text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5">{unread}</span>}</TabsTrigger>
              <TabsTrigger value="read">Read</TabsTrigger>
            </TabsList>
            <TabsContent value="unread" className="flex-1 overflow-y-auto px-4 pb-4 mt-2">
              <NotifList items={unreadItems} emptyLabel="You're all caught up." onItemClick={markOneRead} />
            </TabsContent>
            <TabsContent value="read" className="flex-1 overflow-y-auto px-4 pb-4 mt-2">
              <NotifList items={read} emptyLabel="No read notifications yet." />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
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
    return <div className="py-12 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
  return (
    <div className="divide-y">
      {items.map((n) => (
        <div
          key={n.id}
          onClick={() => onItemClick && !n.is_read && onItemClick(n.id)}
          className={`py-3 ${!n.is_read ? "cursor-pointer hover:bg-accent/40 -mx-4 px-4 rounded" : "opacity-70"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm flex items-center gap-2">
              {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              {n.title}
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
            </div>
          </div>
          {n.body && <div className="text-sm text-muted-foreground mt-1">{n.body}</div>}
        </div>
      ))}
    </div>
  );
}