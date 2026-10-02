import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import {
  LOGO_BUCKET, SITE_KEYS, readSettingValue, safeUrl, whatsappHref, writeSettingValue,
} from "@/lib/site-settings";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: PlatformSettings });

type Field = { k: string; label: string; placeholder?: string; validate?: (v: string) => string | null };

const isUrl = (v: string) => (safeUrl(v) ? null : "Enter a valid link, e.g. https://…");

const CONTACT_FIELDS: Field[] = [
  { k: SITE_KEYS.email, label: "Email", placeholder: "support@example.com",
    validate: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email") },
  { k: SITE_KEYS.phone, label: "Phone", placeholder: "+91 98765 43210",
    validate: (v) => (/^[+\d\s().-]{7,20}$/.test(v) ? null : "Enter a valid phone number") },
  { k: SITE_KEYS.location, label: "Location", placeholder: "City, State, Country" },
];

const SOCIAL_FIELDS: Field[] = [
  { k: SITE_KEYS.instagram, label: "Instagram", placeholder: "https://instagram.com/yourpage", validate: isUrl },
  { k: SITE_KEYS.facebook, label: "Facebook", placeholder: "https://facebook.com/yourpage", validate: isUrl },
  { k: SITE_KEYS.linkedin, label: "LinkedIn", placeholder: "https://linkedin.com/company/yourpage", validate: isUrl },
  { k: SITE_KEYS.whatsapp, label: "WhatsApp", placeholder: "+91 98765 43210 or https://wa.me/919876543210",
    validate: (v) => (whatsappHref(v) ? null : "Enter a WhatsApp number or link") },
];

const GENERAL_FIELDS: Field[] = [
  { k: "trial_days", label: "Free trial (days)" },
];

const ALL_FIELDS = [...CONTACT_FIELDS, ...SOCIAL_FIELDS, ...GENERAL_FIELDS];
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function PlatformSettings() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [about, setAbout] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from("platform_settings").select("*");
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const m: Record<string, string> = {};
    (data || []).forEach((r) => {
      if (r.key === "about") setAbout(readSettingValue(r.key, r.value));
      else if (r.key === SITE_KEYS.logoUrl) setLogoUrl(readSettingValue(r.key, r.value));
      else m[r.key] = readSettingValue(r.key, r.value);
    });
    setVals(m);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function validate() {
    const e: Record<string, string> = {};
    ALL_FIELDS.forEach((f) => {
      const v = (vals[f.k] || "").trim();
      const msg = v && f.validate?.(v);
      if (msg) e[f.k] = msg;
    });
    if (logoUrl.trim() && !safeUrl(logoUrl)) e[SITE_KEYS.logoUrl] = "Enter a valid image link";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return toast.error("Fix the highlighted fields first");
    setSaving(true);
    const rows = ALL_FIELDS.map((f) => writeSettingValue(f.k, vals[f.k] || ""));
    rows.push(writeSettingValue("about", about));
    rows.push(writeSettingValue(SITE_KEYS.logoUrl, logoUrl));
    const { error } = await supabase.from("platform_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Platform settings saved");
  }

  async function uploadLogo(file: File) {
    if (!LOGO_TYPES.includes(file.type)) return toast.error("Use a PNG, JPG, WebP or GIF image");
    if (file.size > LOGO_MAX_BYTES) return toast.error("Logo must be 2 MB or smaller");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `branding/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "3600" });
    setUploading(false);
    if (error) {
      return toast.error(/bucket not found/i.test(error.message)
        ? `Storage bucket "${LOGO_BUCKET}" doesn't exist yet — paste a logo URL instead.`
        : error.message);
    }
    setLogoUrl(supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl);
    setErrors(({ [SITE_KEYS.logoUrl]: _, ...rest }) => rest);
    toast.success("Logo uploaded — save settings to publish it");
  }

  const renderField = (f: Field) => (
    <div key={f.k} className="space-y-1">
      <Label htmlFor={f.k}>{f.label}</Label>
      <Input id={f.k} value={vals[f.k] || ""} placeholder={f.placeholder} aria-invalid={!!errors[f.k]}
        className={errors[f.k] ? "border-destructive" : undefined}
        onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} />
      {errors[f.k] && <p className="text-xs text-destructive">{errors[f.k]}</p>}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-semibold">Platform settings</h1>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-semibold">Platform settings</h1>
        <Card className="p-5 space-y-3">
          <p className="text-sm text-destructive">Couldn't load settings: {loadError}</p>
          <Button variant="outline" onClick={load}>Retry</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Platform settings</h1>

      <Card className="p-5 space-y-3">
        <div>
          <div className="font-medium">Website logo</div>
          <p className="text-xs text-muted-foreground">Shown in the public website header and footer. Leave empty to use the default PlatesOS logo.</p>
        </div>
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 shrink-0 rounded border grid place-items-center bg-muted/40 overflow-hidden">
            {safeUrl(logoUrl)
              ? <img src={logoUrl} alt="Logo preview" className="h-full w-full object-contain" />
              : <span className="text-[10px] text-muted-foreground">Default</span>}
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input id="logo-url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png"
              aria-invalid={!!errors[SITE_KEYS.logoUrl]} className={errors[SITE_KEYS.logoUrl] ? "border-destructive" : undefined} />
            {errors[SITE_KEYS.logoUrl] && <p className="text-xs text-destructive">{errors[SITE_KEYS.logoUrl]}</p>}
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept={LOGO_TYPES.join(",")} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadLogo(f); }} />
              <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload image"}
              </Button>
              {logoUrl && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setLogoUrl("")}>
                  <X className="mr-1.5 h-4 w-4" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG, WebP or GIF, up to 2 MB.</p>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div>
          <div className="font-medium">Contact information</div>
          <p className="text-xs text-muted-foreground">Shown in the Contact section of the public website. Empty fields are hidden.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">{CONTACT_FIELDS.map(renderField)}</div>
      </Card>

      <Card className="p-5 space-y-3">
        <div>
          <div className="font-medium">Social links</div>
          <p className="text-xs text-muted-foreground">Shown in the website footer. Leave a field empty to hide that icon. WhatsApp also powers the chat buttons.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">{SOCIAL_FIELDS.map(renderField)}</div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-medium">General</div>
        <div className="grid sm:grid-cols-2 gap-3">{GENERAL_FIELDS.map(renderField)}</div>
        <div className="space-y-1"><Label htmlFor="about">About the platform</Label><Textarea id="about" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} /></div>
      </Card>

      <Button onClick={save} disabled={saving || uploading}>
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
