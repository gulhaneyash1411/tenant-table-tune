-- customer extras
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS anniversary date;

-- settings
CREATE TABLE public.whatsapp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_sid text,
  auth_token text,
  sender_number text,
  use_platform_sender boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa settings tenant" ON public.whatsapp_settings FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "wa settings super read" ON public.whatsapp_settings FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- templates
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'marketing',
  body text NOT NULL,
  media_url text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa tpl tenant" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "wa tpl super read" ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- campaigns
CREATE TABLE public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'promo',
  body text NOT NULL,
  media_url text,
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  segment jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa camp tenant" ON public.whatsapp_campaigns FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "wa camp super read" ON public.whatsapp_campaigns FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- messages
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  to_name text,
  body text NOT NULL,
  media_url text,
  status text NOT NULL DEFAULT 'queued',
  provider_sid text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa msg tenant" ON public.whatsapp_messages FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "wa msg super read" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX idx_wa_msg_tenant_created ON public.whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX idx_wa_msg_campaign ON public.whatsapp_messages(campaign_id);
CREATE INDEX idx_wa_msg_sid ON public.whatsapp_messages(provider_sid);
CREATE INDEX idx_wa_camp_tenant_created ON public.whatsapp_campaigns(tenant_id, created_at DESC);
CREATE INDEX idx_wa_camp_sched ON public.whatsapp_campaigns(status, scheduled_at);

CREATE TRIGGER trg_wa_settings_touch BEFORE UPDATE ON public.whatsapp_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_wa_tpl_touch BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_wa_camp_touch BEFORE UPDATE ON public.whatsapp_campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_wa_msg_touch BEFORE UPDATE ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();