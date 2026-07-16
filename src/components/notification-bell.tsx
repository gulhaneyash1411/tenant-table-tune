import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <button onClick={() => setOpen(true)} className="relative h-9 w-9 rounded-lg hover:bg-accent grid place-items-center">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium grid place-items-center">{unread}</span>}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center justify-between">
              <span>Notifications</span>
              {unread > 0 && <Button variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>}
            </SheetTitle>
          </SheetHeader>
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

function NotifList({ items, emptyLabel, onItemClick }: { items: any[]; emptyLabel: string; onItemClick?: (id: string) => void }) {
  if (items.length === 0) return <div className="py-12 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
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
            <div className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</div>
          </div>
          {n.body && <div className="text-sm text-muted-foreground mt-1">{n.body}</div>}
        </div>
      ))}
    </div>
  );
}