import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getReviewTarget } from "@/lib/public-orders.functions";
import { noindexHead } from "@/lib/seo";

export const Route = createFileRoute("/review")({
  head: noindexHead,
  component: ReviewPage,
  validateSearch: (search: Record<string, unknown>): { t?: string } => ({
    t: typeof search.t === "string" ? search.t : undefined,
  }),
});

const RATING_LABELS = [
  "Tap a star to rate",
  "Not good",
  "Could be better",
  "It was fine",
  "Really good",
  "Loved it",
];

function ReviewPage() {
  const { t } = Route.useSearch();

  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const shown = hovered || rating;
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!t) return;
    getReviewTarget({ data: { tenant_id: t } })
      .then((r) => setReviewUrl(r.google_review_url))
      .catch(() => setReviewUrl(null));
  }, [t]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!t) return toast.error("Missing tenant");
    if (!rating) return toast.error("Please pick a rating");
    if (!comment.trim()) return toast.error("Please tell us a little about your visit");

    setSubmitting(true);
    const { error } = await supabase.from("reviews").insert({
      tenant_id: t,
      customer_name: name.trim() || null,
      rating,
      comment: comment.trim(),
    });
    setSubmitting(false);

    if (error) return toast.error(error.message);
    setDone(true);
  }

  function onStarKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setRating((r) => Math.min(5, r + 1));
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setRating((r) => Math.max(1, r - 1));
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="animate-in fade-in zoom-in-95 duration-500 rounded-2xl border border-border/60 bg-card/80 p-7 text-center shadow-xl shadow-black/5 backdrop-blur">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 ring-8 ring-primary/5">
            <Check className="h-7 w-7 text-primary" strokeWidth={3} />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Thank you!</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Your feedback helps us serve you better. We hope to see you again soon.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-xl shadow-black/5 backdrop-blur">
        <header className="border-b border-border/60 px-6 pb-4 pt-5 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Your feedback
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Rate your visit</h1>
        </header>

        <form onSubmit={submit} className="space-y-4 px-6 pb-6 pt-5">
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Overall rating</legend>
            <div
              role="radiogroup"
              aria-label="Overall rating"
              aria-required="true"
              onKeyDown={onStarKeyDown}
              onMouseLeave={() => setHovered(0)}
              className="flex justify-center gap-1"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n > 1 ? "s" : ""} — ${RATING_LABELS[n]}`}
                  tabIndex={rating === n || (!rating && n === 1) ? 0 : -1}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  onFocus={() => setHovered(n)}
                  onBlur={() => setHovered(0)}
                  className="rounded-full p-0.5 transition-transform duration-150 hover:scale-115 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95"
                >
                  <Star
                    className={`h-9 w-9 transition-colors duration-150 ${
                      n <= shown
                        ? "fill-warning text-warning"
                        : "fill-muted/40 text-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p
              aria-live="polite"
              className={`text-center text-sm font-medium transition-colors ${
                shown ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {shown ? RATING_LABELS[shown] : "Rating required: tap a star"}
            </p>
          </fieldset>

          <div className="space-y-3">
            <Field id="name" label="Your name" hint="Optional">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoComplete="name"
                className="h-11"
              />
            </Field>

            <Field
              id="comment"
              label={rating > 0 && rating <= 3 ? "What could we do better?" : "Anything to add?"}
              required
            >
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us about the food, service or ambience…"
                rows={3}
                required
                aria-required="true"
                className="resize-none"
              />
            </Field>
          </div>

          {reviewUrl && (
            <p className="text-center text-sm">
              <a href={reviewUrl} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
                Review us on Google
              </a>
            </p>
          )}

          <Button type="submit" disabled={submitting} className="mt-1 h-11 w-full">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Submit review"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Your feedback goes straight to the restaurant team.
          </p>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/50 via-background to-background px-4 py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(60%_100%_at_50%_0%,hsl(var(--primary)/0.12),transparent_70%)]"
      />
      <main className="relative w-full max-w-sm">{children}</main>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}