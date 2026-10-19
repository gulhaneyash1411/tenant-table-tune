import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Briefcase, UserPlus } from "lucide-react";
import { ADMIN_PAGE_SIZE, Pager } from "@/components/admin/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/sales")({ component: SalesTeam });

type SalesAccount = {
  id: string;
  user_id: string;
  is_active: boolean;
  created_at: string;
  full_name: string | null;
  email: string | null;
};

// Foundation only: create/list/enable-disable/rotate-password/delete for
// Sales Team accounts. What Sales Users can actually do once signed in
// (src/routes/_authenticated/sales.tsx) is a separate, later task.
async function callSalesApi(body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    toast.error("Session expired. Please sign in again.");
    return null;
  }
  const res = await fetch("/api/sales-account", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast.error(json.error || "Something went wrong");
    return null;
  }
  return json;
}

function SalesTeam() {
  const [accounts, setAccounts] = useState<SalesAccount[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  async function load() {
    const res = await callSalesApi({ action: "list" });
    if (res) setAccounts(res.accounts);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Enter a name");
    if (!email.trim()) return toast.error("Enter an email");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    const res = await callSalesApi({ action: "create", full_name: fullName, email, password });
    setBusy(false);
    if (!res) return;
    toast.success("Sales account created");
    setFullName("");
    setEmail("");
    setPassword("");
    setCreateOpen(false);
    load();
  }

  async function toggleActive(userId: string, next: boolean) {
    setBusy(true);
    const res = await callSalesApi({ action: "set_active", user_id: userId, is_active: next });
    setBusy(false);
    if (!res) return;
    toast.success(next ? "Account enabled" : "Account disabled");
    load();
  }

  async function rotatePassword(userId: string) {
    const password = passwordEdits[userId] ?? "";
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    const res = await callSalesApi({ action: "update_password", user_id: userId, password });
    setBusy(false);
    if (!res) return;
    toast.success("Password updated");
    setPasswordEdits((p) => ({ ...p, [userId]: "" }));
  }

  async function deleteAccount(userId: string) {
    setBusy(true);
    const res = await callSalesApi({ action: "delete", user_id: userId });
    setBusy(false);
    if (!res) return;
    toast.success("Sales account deleted");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" />
          Create Sales User
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Reset password</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts === null ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No sales accounts yet. Create the first one above.
                </TableCell>
              </TableRow>
            ) : (
              accounts.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.full_name || "—"}</TableCell>
                  <TableCell className="text-sm">{a.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={a.is_active}
                        onCheckedChange={(v) => toggleActive(a.user_id, v)}
                        disabled={busy}
                        aria-label={`${a.full_name ?? "Account"} enabled`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {a.is_active ? "Active" : "Disabled"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{format(new Date(a.created_at), "PP")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PasswordInput
                        value={passwordEdits[a.user_id] ?? ""}
                        onChange={(e) =>
                          setPasswordEdits((p) => ({ ...p, [a.user_id]: e.target.value }))
                        }
                        autoComplete="new-password"
                        className="h-8 w-36"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || (passwordEdits[a.user_id] ?? "").length < 6}
                        onClick={() => rotatePassword(a.user_id)}
                      >
                        Update
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" size="sm" variant="destructive" disabled={busy}>
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this sales account?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes <b>{a.full_name || a.email}</b>'s login.
                            They'll be signed out immediately and won't be able to sign back in.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteAccount(a.user_id)}>
                            Yes, delete it
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      {accounts && accounts.length > 0 && (
        <Pager page={page} total={accounts.length} pageSize={ADMIN_PAGE_SIZE} onPage={setPage} />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sales User</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sales-name">Name</Label>
              <Input
                id="sales-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sales-email">Email</Label>
              <Input
                id="sales-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sales-password">Password</Label>
              <PasswordInput
                id="sales-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create Sales User"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
