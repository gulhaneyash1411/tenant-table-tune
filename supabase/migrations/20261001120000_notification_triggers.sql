-- Automated notifications for restaurant owners and super admins.
--
-- Before this migration the only automatic notification on the platform was
-- "new restaurant registration" to super admins; everything else had to be
-- sent by hand from the admin console. This adds the event-driven and
-- scheduled notifications both audiences need.
--
-- Two conventions used throughout:
--
--  1. meta->>'ref' is a dedup key. Scheduled jobs re-run on a timer, so every
--     one of them checks for an existing notification with the same ref
--     before inserting. Without it a 5-minute job would re-notify forever.
--  2. Triggers on tables that anon can INSERT into (orders, reviews) swallow
--     their own errors. A failing notification must never roll back a
--     customer's order.

-- Dedup lookups, plus the notification bell's own query (recipient + recency).
CREATE INDEX IF NOT EXISTS idx_notifications_dedup
  ON public.notifications (kind, (meta->>'ref'));
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_recent
  ON public.notifications (recipient_id, created_at DESC);

-- ============================================================
-- HELPERS
-- ============================================================

-- Notify a tenant's owner. No-op when the tenant has no owner account
-- (admin-created tenants briefly have none) or when p_ref was already used.
CREATE OR REPLACE FUNCTION public.notify_tenant_owner(
  p_tenant_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_kind TEXT,
  p_ref TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT '{}'::JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM public.tenants WHERE id = p_tenant_id;
  IF v_owner IS NULL THEN RETURN; END IF;

  IF p_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE kind = p_kind AND meta->>'ref' = p_ref
  ) THEN RETURN; END IF;

  INSERT INTO public.notifications (recipient_id, tenant_id, title, body, kind, channel, meta)
  VALUES (
    v_owner, p_tenant_id, p_title, p_body, p_kind, 'dashboard',
    CASE WHEN p_ref IS NULL THEN p_meta ELSE p_meta || jsonb_build_object('ref', p_ref) END
  );
END; $$;

-- Notify every super admin. p_tenant_id may be NULL for platform-wide notices.
CREATE OR REPLACE FUNCTION public.notify_super_admins(
  p_tenant_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_kind TEXT,
  p_ref TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT '{}'::JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE kind = p_kind AND meta->>'ref' = p_ref
  ) THEN RETURN; END IF;

  INSERT INTO public.notifications (recipient_id, tenant_id, title, body, kind, channel, meta)
  SELECT ur.user_id, p_tenant_id, p_title, p_body, p_kind, 'dashboard',
    CASE WHEN p_ref IS NULL THEN p_meta ELSE p_meta || jsonb_build_object('ref', p_ref) END
  FROM public.user_roles ur
  WHERE ur.role = 'super_admin';
END; $$;

-- ============================================================
-- OWNER P1 — restaurant approved / rejected / suspended
-- ============================================================
-- Owners previously only saw the gate screen change with no explanation.

CREATE OR REPLACE FUNCTION public.notify_tenant_status_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title TEXT; v_body TEXT;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' AND OLD.status = 'suspended' THEN
    v_title := 'Your account is active again';
    v_body  := 'The suspension on ' || NEW.name || ' has been lifted. You can take orders as usual.';
  ELSIF NEW.status = 'approved' THEN
    v_title := 'Your restaurant is approved';
    v_body  := NEW.name || ' is live. Finish your profile, build your menu and print your table QR codes to start taking orders.';
  ELSIF NEW.status = 'rejected' THEN
    v_title := 'Registration not approved';
    v_body  := 'Your registration for ' || NEW.name || ' was not approved. Contact support if you think this is a mistake.';
  ELSIF NEW.status = 'suspended' THEN
    v_title := 'Your account is suspended';
    v_body  := NEW.name || ' has been suspended and cannot take orders right now. Contact support to resolve this.';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.notify_tenant_owner(
    NEW.id, v_title, v_body, 'tenant_status',
    'status:' || NEW.id || ':' || NEW.status || ':' || EXTRACT(EPOCH FROM now())::BIGINT,
    jsonb_build_object('status', NEW.status, 'previous', OLD.status)
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tenant_status_notify ON public.tenants;
CREATE TRIGGER trg_tenant_status_notify
  AFTER UPDATE OF status ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.notify_tenant_status_change();

-- ============================================================
-- OWNER P2 — new review (1–2 stars flagged separately)
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_new_review() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_who TEXT; v_stars TEXT;
BEGIN
  v_who   := COALESCE(NULLIF(TRIM(NEW.customer_name), ''), 'A customer');
  v_stars := NEW.rating || (CASE WHEN NEW.rating = 1 THEN ' star' ELSE ' stars' END);

  IF NEW.rating <= 2 THEN
    PERFORM public.notify_tenant_owner(
      NEW.tenant_id,
      'Low rating needs attention: ' || v_stars,
      v_who || ' left ' || v_stars || '.' ||
        COALESCE(' "' || LEFT(NEW.comment, 180) || '"', '') ||
        ' Reach out before they tell anyone else.',
      'review_low', 'review:' || NEW.id,
      jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating)
    );
  ELSE
    PERFORM public.notify_tenant_owner(
      NEW.tenant_id,
      'New review: ' || v_stars,
      v_who || ' left ' || v_stars || '.' || COALESCE(' "' || LEFT(NEW.comment, 180) || '"', ''),
      'review_new', 'review:' || NEW.id,
      jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a customer's review submission.
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_review_notify ON public.reviews;
CREATE TRIGGER trg_review_notify
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_review();

-- ============================================================
-- ADMIN P1 — payment submitted with UTR, awaiting approval
-- ============================================================
-- Fires on insert (the normal path from /app/subscription) and on any later
-- transition into pending_approval, e.g. a resubmission after rejection.

CREATE OR REPLACE FUNCTION public.notify_invoice_pending_approval() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending_approval' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending_approval' THEN RETURN NEW; END IF;

  SELECT name INTO v_name FROM public.tenants WHERE id = NEW.tenant_id;

  PERFORM public.notify_super_admins(
    NEW.tenant_id,
    'Payment awaiting approval',
    COALESCE(v_name, 'A restaurant') || ' submitted Rs ' || NEW.amount::TEXT ||
      ' for ' || COALESCE(NEW.plan, 'a plan') ||
      COALESCE(' (' || NEW.billing_cycle || ')', '') ||
      COALESCE('. UTR ' || NEW.utr, '') || '. Verify and approve it in Billing.',
    'invoice_pending',
    'invpend:' || NEW.id,
    jsonb_build_object('invoice_id', NEW.id, 'amount', NEW.amount, 'utr', NEW.utr)
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_invoice_pending_notify ON public.invoices;
CREATE TRIGGER trg_invoice_pending_notify
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_invoice_pending_approval();

-- ============================================================
-- ADMIN P2 — restaurant went live (first order placed)
-- ============================================================
-- A strong sales-follow-up signal: the restaurant finished setup and is
-- actually transacting, not just approved.

CREATE OR REPLACE FUNCTION public.notify_tenant_first_order() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  -- Cheap guard first: only the very first order of a tenant proceeds.
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE tenant_id = NEW.tenant_id AND id <> NEW.id
    LIMIT 1
  ) THEN RETURN NEW; END IF;

  SELECT name INTO v_name FROM public.tenants WHERE id = NEW.tenant_id;

  PERFORM public.notify_super_admins(
    NEW.tenant_id,
    'Restaurant went live',
    COALESCE(v_name, 'A restaurant') || ' just took its first order. Good moment for a check-in call.',
    'tenant_live',
    'firstorder:' || NEW.tenant_id,
    jsonb_build_object('order_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a customer's order.
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_first_order_notify ON public.orders;
CREATE TRIGGER trg_first_order_notify
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_tenant_first_order();

-- ============================================================
-- OWNER P2 — new reservation / event enquiry
-- ============================================================
-- table_reservations and event_bookings were created outside this migrations
-- folder, so each block is guarded on the table actually existing.

DO $outer$
BEGIN
  IF to_regclass('public.table_reservations') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.notify_new_reservation() RETURNS TRIGGER
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      BEGIN
        PERFORM public.notify_tenant_owner(
          NEW.tenant_id,
          'New table booking',
          COALESCE(NEW.guest_name, 'A guest') || ' booked a table for ' ||
            COALESCE(NEW.party_size, 2) || ' on ' ||
            to_char(NEW.reserved_for AT TIME ZONE 'Asia/Kolkata', 'DD Mon "at" HH12:MI AM') || '.',
          'booking_new', 'resv:' || NEW.id,
          jsonb_build_object('reservation_id', NEW.id)
        );
        RETURN NEW;
      EXCEPTION WHEN OTHERS THEN RETURN NEW;
      END; $body$;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_reservation_notify ON public.table_reservations';
    EXECUTE 'CREATE TRIGGER trg_reservation_notify
      AFTER INSERT ON public.table_reservations
      FOR EACH ROW EXECUTE FUNCTION public.notify_new_reservation()';
  END IF;

  IF to_regclass('public.event_bookings') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.notify_new_event_booking() RETURNS TRIGGER
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      BEGIN
        PERFORM public.notify_tenant_owner(
          NEW.tenant_id,
          'New event enquiry',
          COALESCE(NEW.contact_name, 'Someone') || ' enquired about a ' ||
            COALESCE(NEW.event_type, 'event') || ' for ' ||
            COALESCE(NEW.guest_count, 0) || ' guests on ' ||
            to_char(NEW.starts_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon "at" HH12:MI AM') || '.',
          'event_new', 'event:' || NEW.id,
          jsonb_build_object('event_id', NEW.id)
        );
        RETURN NEW;
      EXCEPTION WHEN OTHERS THEN RETURN NEW;
      END; $body$;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_event_booking_notify ON public.event_bookings';
    EXECUTE 'CREATE TRIGGER trg_event_booking_notify
      AFTER INSERT ON public.event_bookings
      FOR EACH ROW EXECUTE FUNCTION public.notify_new_event_booking()';
  END IF;
END $outer$;

-- ============================================================
-- SCHEDULED: OWNER P1 — order stuck in "new" for over 10 minutes
-- ============================================================
-- The one that saves walk-outs: nobody in the kitchen has acknowledged the
-- ticket. Runs every 5 minutes.

CREATE OR REPLACE FUNCTION public.notify_stale_orders() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_count INT := 0;
BEGIN
  FOR r IN
    SELECT o.id, o.tenant_id, o.order_number, o.order_type, o.total, o.created_at
    FROM public.orders o
    JOIN public.tenants t ON t.id = o.tenant_id
    WHERE o.status = 'new'
      AND t.status = 'approved'
      AND o.created_at < now() - INTERVAL '10 minutes'
      AND o.created_at > now() - INTERVAL '1 day'   -- ignore ancient strays
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.kind = 'order_stale' AND n.meta->>'ref' = 'stale:' || o.id
      )
  LOOP
    PERFORM public.notify_tenant_owner(
      r.tenant_id,
      'Order #' || r.order_number || ' not started yet',
      'This ' || REPLACE(r.order_type::TEXT, '_', ' ') || ' order has been waiting ' ||
        FLOOR(EXTRACT(EPOCH FROM (now() - r.created_at)) / 60)::TEXT ||
        ' minutes with nobody in the kitchen picking it up. Rs ' || r.total::TEXT || '.',
      'order_stale', 'stale:' || r.id,
      jsonb_build_object('order_id', r.id, 'order_number', r.order_number)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- ============================================================
-- SCHEDULED: OWNER P1 — trial ending in 3 days / 1 day / expired
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_trial_expiry() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_count INT := 0; v_days INT;
BEGIN
  FOR r IN
    SELECT s.id, s.tenant_id, s.trial_ends_at
    FROM public.subscriptions s
    JOIN public.tenants t ON t.id = s.tenant_id
    WHERE s.status = 'trialing'
      AND s.trial_ends_at IS NOT NULL
      AND t.status = 'approved'
      AND s.trial_ends_at < now() + INTERVAL '3 days'
      AND s.trial_ends_at > now() - INTERVAL '7 days'
  LOOP
    v_days := CEIL(EXTRACT(EPOCH FROM (r.trial_ends_at - now())) / 86400.0)::INT;

    IF r.trial_ends_at <= now() THEN
      PERFORM public.notify_tenant_owner(
        r.tenant_id,
        'Your free trial has ended',
        'Pick a plan on the Subscription page to keep taking orders without interruption.',
        'trial_expiry', 'trialend:' || r.id,
        jsonb_build_object('subscription_id', r.id, 'stage', 'expired')
      );
    ELSIF v_days <= 1 THEN
      PERFORM public.notify_tenant_owner(
        r.tenant_id,
        'Your free trial ends tomorrow',
        'Choose a plan on the Subscription page today so your restaurant keeps running.',
        'trial_expiry', 'trial1:' || r.id,
        jsonb_build_object('subscription_id', r.id, 'stage', '1day')
      );
    ELSE
      PERFORM public.notify_tenant_owner(
        r.tenant_id,
        'Your free trial ends in ' || v_days || ' days',
        'Pick a plan on the Subscription page whenever you are ready — no interruption if you do it before then.',
        'trial_expiry', 'trial3:' || r.id,
        jsonb_build_object('subscription_id', r.id, 'stage', '3day')
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- ============================================================
-- SCHEDULED: OWNER P2 — booking reminder one hour out
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_booking_reminders() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_count INT := 0;
BEGIN
  IF to_regclass('public.table_reservations') IS NOT NULL THEN
    FOR r IN
      SELECT tr.id, tr.tenant_id, tr.guest_name, tr.party_size, tr.reserved_for
      FROM public.table_reservations tr
      WHERE tr.status = 'booked'
        AND tr.reserved_for BETWEEN now() AND now() + INTERVAL '1 hour'
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.kind = 'booking_reminder' AND n.meta->>'ref' = 'resv1h:' || tr.id
        )
    LOOP
      PERFORM public.notify_tenant_owner(
        r.tenant_id,
        'Table booking in under an hour',
        COALESCE(r.guest_name, 'A guest') || ', party of ' || COALESCE(r.party_size, 2) ||
          ', at ' || to_char(r.reserved_for AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') || '. Get the table ready.',
        'booking_reminder', 'resv1h:' || r.id,
        jsonb_build_object('reservation_id', r.id)
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  IF to_regclass('public.event_bookings') IS NOT NULL THEN
    FOR r IN
      SELECT eb.id, eb.tenant_id, eb.contact_name, eb.event_type, eb.guest_count, eb.starts_at
      FROM public.event_bookings eb
      WHERE eb.status = 'confirmed'
        AND eb.starts_at BETWEEN now() AND now() + INTERVAL '1 hour'
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.kind = 'booking_reminder' AND n.meta->>'ref' = 'event1h:' || eb.id
        )
    LOOP
      PERFORM public.notify_tenant_owner(
        r.tenant_id,
        'Event starts in under an hour',
        COALESCE(r.event_type, 'Event') || ' for ' || COALESCE(r.guest_count, 0) ||
          ' guests, contact ' || COALESCE(r.contact_name, 'unknown') || '.',
        'booking_reminder', 'event1h:' || r.id,
        jsonb_build_object('event_id', r.id)
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN v_count;
END; $$;

-- ============================================================
-- SCHEDULED: ADMIN P1 — past-due / expired subscriptions digest
-- ============================================================
-- One digest per day rather than one notification per tenant.

CREATE OR REPLACE FUNCTION public.notify_past_due_digest() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_expired INT; v_pastdue INT; v_names TEXT; v_ref TEXT;
BEGIN
  v_ref := 'pastdue:' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');

  SELECT
    COUNT(*) FILTER (WHERE s.status IN ('expired', 'canceled')
                       AND s.current_period_end > now() - INTERVAL '1 day'),
    COUNT(*) FILTER (WHERE s.status = 'active' AND s.current_period_end < now())
  INTO v_expired, v_pastdue
  FROM public.subscriptions s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE t.status = 'approved';

  IF COALESCE(v_expired, 0) + COALESCE(v_pastdue, 0) = 0 THEN RETURN 0; END IF;

  SELECT string_agg(x.name, ', ') INTO v_names FROM (
    SELECT t.name
    FROM public.subscriptions s
    JOIN public.tenants t ON t.id = s.tenant_id
    WHERE t.status = 'approved'
      AND ((s.status = 'active' AND s.current_period_end < now())
        OR (s.status IN ('expired', 'canceled') AND s.current_period_end > now() - INTERVAL '1 day'))
    ORDER BY t.name
    LIMIT 10
  ) x;

  PERFORM public.notify_super_admins(
    NULL,
    'Billing attention: ' || (COALESCE(v_expired, 0) + COALESCE(v_pastdue, 0)) || ' restaurant(s)',
    COALESCE(v_pastdue, 0) || ' past due, ' || COALESCE(v_expired, 0) ||
      ' newly expired or cancelled. ' || COALESCE(v_names, '') || '.',
    'billing_digest', v_ref,
    jsonb_build_object('past_due', v_pastdue, 'expired', v_expired)
  );
  RETURN 1;
END; $$;

-- ============================================================
-- SCHEDULED: ADMIN P2 — infrastructure quota warnings
-- ============================================================
-- Threshold check rather than a vendor webhook: DB size against the Supabase
-- Pro allowance, and WhatsApp volume this month against a spend ceiling.
-- Override either in platform_settings under key 'quota_thresholds',
-- e.g. {"db_gb": 6, "whatsapp_monthly": 5000}

CREATE OR REPLACE FUNCTION public.notify_quota_warnings() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg JSONB;
  v_db_limit NUMERIC; v_wa_limit NUMERIC;
  v_db_gb NUMERIC; v_wa_count NUMERIC;
  v_sent INT := 0; v_month TEXT;
BEGIN
  v_month := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');

  SELECT value INTO v_cfg FROM public.platform_settings WHERE key = 'quota_thresholds';
  v_db_limit := COALESCE((v_cfg->>'db_gb')::NUMERIC, 6);
  v_wa_limit := COALESCE((v_cfg->>'whatsapp_monthly')::NUMERIC, 5000);

  v_db_gb := ROUND(pg_database_size(current_database()) / 1073741824.0, 2);
  IF v_db_gb >= v_db_limit THEN
    PERFORM public.notify_super_admins(
      NULL,
      'Database size at ' || v_db_gb || ' GB',
      'Past the ' || v_db_limit || ' GB warning line. Supabase Pro includes 8 GB — ' ||
        'consider archiving old orders or moving to the next tier.',
      'quota_warning', 'quota_db:' || v_month,
      jsonb_build_object('db_gb', v_db_gb, 'limit_gb', v_db_limit)
    );
    v_sent := v_sent + 1;
  END IF;

  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.whatsapp_messages WHERE created_at >= date_trunc(''month'', now())'
      INTO v_wa_count;

    IF v_wa_count >= v_wa_limit THEN
      PERFORM public.notify_super_admins(
        NULL,
        'WhatsApp volume at ' || v_wa_count || ' messages this month',
        'Past the ' || v_wa_limit || ' message warning line, roughly Rs ' ||
          ROUND(v_wa_count * 0.75)::TEXT || ' at Rs 0.75 each. Platform absorbs this cost — ' ||
          'check it against plan allowances.',
        'quota_warning', 'quota_wa:' || v_month,
        jsonb_build_object('messages', v_wa_count, 'limit', v_wa_limit)
      );
      v_sent := v_sent + 1;
    END IF;
  END IF;

  RETURN v_sent;
END; $$;

-- ============================================================
-- SCHEDULED: ADMIN P3 — weekly platform digest
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_weekly_digest() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_signups INT; v_live INT; v_churned INT; v_mrr NUMERIC;
  v_orders INT; v_pending INT; v_ref TEXT;
BEGIN
  v_ref := 'weekly:' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'IYYY-IW');

  SELECT COUNT(*) INTO v_signups
    FROM public.tenants WHERE created_at >= now() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_live
    FROM public.tenants WHERE status = 'approved';

  SELECT COUNT(*) INTO v_pending
    FROM public.tenants WHERE status = 'pending';

  SELECT COUNT(*) INTO v_churned
    FROM public.subscriptions
    WHERE status IN ('canceled', 'expired')
      AND current_period_end >= now() - INTERVAL '7 days';

  SELECT COALESCE(SUM(sp.monthly_price), 0) INTO v_mrr
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.id = s.plan_id
    WHERE s.status = 'active';

  SELECT COUNT(*) INTO v_orders
    FROM public.orders WHERE created_at >= now() - INTERVAL '7 days';

  PERFORM public.notify_super_admins(
    NULL,
    'Weekly platform digest',
    v_signups || ' new signup(s), ' || v_pending || ' awaiting approval, ' ||
      v_live || ' live restaurant(s). MRR Rs ' || ROUND(v_mrr)::TEXT || '. ' ||
      v_churned || ' churned this week. ' || v_orders || ' orders platform-wide.',
    'platform_digest', v_ref,
    jsonb_build_object(
      'signups', v_signups, 'pending', v_pending, 'live', v_live,
      'churned', v_churned, 'mrr', v_mrr, 'orders', v_orders
    )
  );
  RETURN 1;
END; $$;

-- ============================================================
-- SCHEDULE (cron runs in UTC; IST = UTC+5:30)
-- ============================================================

SELECT cron.unschedule('notify-stale-orders')     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-stale-orders');
SELECT cron.unschedule('notify-trial-expiry')     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-trial-expiry');
SELECT cron.unschedule('notify-booking-reminders')WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-booking-reminders');
SELECT cron.unschedule('notify-past-due')         WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-past-due');
SELECT cron.unschedule('notify-quota-warnings')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-quota-warnings');
SELECT cron.unschedule('notify-weekly-digest')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-weekly-digest');

-- Every 5 minutes: unacknowledged kitchen tickets.
SELECT cron.schedule('notify-stale-orders', '*/5 * * * *',
  $$SELECT public.notify_stale_orders();$$);

-- Every 15 minutes: bookings coming up within the hour.
SELECT cron.schedule('notify-booking-reminders', '*/15 * * * *',
  $$SELECT public.notify_booking_reminders();$$);

-- Daily 09:00 IST: trial reminders to owners.
SELECT cron.schedule('notify-trial-expiry', '30 3 * * *',
  $$SELECT public.notify_trial_expiry();$$);

-- Daily 09:15 IST: billing digest to super admins.
SELECT cron.schedule('notify-past-due', '45 3 * * *',
  $$SELECT public.notify_past_due_digest();$$);

-- Daily 09:30 IST: infrastructure quota check.
SELECT cron.schedule('notify-quota-warnings', '0 4 * * *',
  $$SELECT public.notify_quota_warnings();$$);

-- Mondays 09:00 IST: platform digest.
SELECT cron.schedule('notify-weekly-digest', '30 3 * * 1',
  $$SELECT public.notify_weekly_digest();$$);

-- ============================================================
-- LOCK DOWN EXECUTE (same posture as the existing security migration)
-- ============================================================

DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.notify_tenant_owner(uuid,text,text,text,text,jsonb)',
    'public.notify_super_admins(uuid,text,text,text,text,jsonb)',
    'public.notify_tenant_status_change()',
    'public.notify_new_review()',
    'public.notify_invoice_pending_approval()',
    'public.notify_tenant_first_order()',
    'public.notify_stale_orders()',
    'public.notify_trial_expiry()',
    'public.notify_booking_reminders()',
    'public.notify_past_due_digest()',
    'public.notify_quota_warnings()',
    'public.notify_weekly_digest()'
  ]) LOOP
    BEGIN EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  IF to_regclass('public.table_reservations') IS NOT NULL THEN
    BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.notify_new_reservation() FROM PUBLIC, anon, authenticated';
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  IF to_regclass('public.event_bookings') IS NOT NULL THEN
    BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.notify_new_event_booking() FROM PUBLIC, anon, authenticated';
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;
