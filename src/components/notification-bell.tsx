import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  async function load() {
    if (!userId) return;
    const { data } = await supabase.from("notifications").select("*").or(`recipient_id.eq.${userId}`).order("created_at", { ascending: false }).limit(30);
    setItems(data || []);
  }
  useEffect(() => { if (userId) load(); }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel("notif-" + userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const unread = items.filter((n) => !n.is_read).length;

  async function markAllRead() {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", userId).eq("is_read", false);
    load();
  }

  return (
    <>
      <button onClick={() => { setOpen(true); markAllRead(); }} className="relative h-9 w-9 rounded-lg hover:bg-accent grid place-items-center">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium grid place-items-center">{unread}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Notifications</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y">
            {items.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>}
            {items.map((n) => (
              <div key={n.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{n.title}</div>
                  <div className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</div>
                </div>
                {n.body && <div className="text-sm text-muted-foreground mt-1">{n.body}</div>}
              </div>
            ))}
          </div>
          {items.length > 0 && <Button variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>}
        </DialogContent>
      </Dialog>
    </>
  );
}