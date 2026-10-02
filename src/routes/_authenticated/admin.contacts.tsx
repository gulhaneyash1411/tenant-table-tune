import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, Inbox, Mail, Phone, RefreshCw, Search, Store, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/contacts")({ component: ContactMessages });

type Message = Tables<"contact_messages">;

const PAGE_SIZE = 10;

// Submissions from the "Send us a message" form on the public website.
// RLS only lets a super admin read this table; the admin layout already
// bounces everyone else out of /admin.
function ContactMessages() {
  const [rows, setRows] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("contact_messages").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.phone, r.restaurant, r.subject, r.message]
        .filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contact messages</h1>
          <p className="text-sm text-muted-foreground">Sent from the "Send us a message" form on the website.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search messages" placeholder="Search name, email, message" value={q}
              onChange={(e) => setQ(e.target.value)} className="pl-8 pr-8" />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="icon" aria-label="Refresh" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}</div>
      ) : error ? (
        <Card className="p-5 space-y-3">
          <p className="text-sm text-destructive">Couldn't load messages: {error}</p>
          <Button variant="outline" onClick={load}>Retry</Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Inbox className="mx-auto mb-2 h-8 w-8" aria-hidden />
          {rows.length === 0 ? "No messages yet. Submissions from the website will appear here." : "No messages match your search."}
          {q && <div><Button variant="link" size="sm" onClick={() => setQ("")}>Clear search</Button></div>}
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filtered.length === rows.length ? `${rows.length} messages` : `${filtered.length} of ${rows.length} messages match`}
          </p>
          <ul className="space-y-3">
            {paged.map((r) => {
              const at = new Date(r.created_at);
              return (
                <li key={r.id}>
                  <Card className="p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{r.name}</div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 hover:text-foreground break-all">
                            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /> {r.email}
                          </a>
                          {r.phone && (
                            <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground">
                              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden /> {r.phone}
                            </a>
                          )}
                          {r.restaurant && (
                            <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5 shrink-0" aria-hidden /> {r.restaurant}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <time dateTime={r.created_at} title={format(at, "PPpp")}>{format(at, "d MMM yyyy, h:mm a")}</time>
                        <div>{formatDistanceToNow(at, { addSuffix: true })}</div>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{r.subject}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{r.message}</p>
                  </Card>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Pagination">
              <span className="text-muted-foreground">
                Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page === 1} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-muted-foreground">Page {page} of {totalPages}</span>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
