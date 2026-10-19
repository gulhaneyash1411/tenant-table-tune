-- Global Menu Management: master menus shared across outlets in a single organization.

-- A master menu template owned by an organization.
CREATE TABLE IF NOT EXISTS public.global_menus (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categories within a global menu.
CREATE TABLE IF NOT EXISTS public.global_menu_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_menu_id  UUID NOT NULL REFERENCES public.global_menus(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  image_url       TEXT,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items within a global menu.
CREATE TABLE IF NOT EXISTS public.global_menu_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_menu_id  UUID NOT NULL REFERENCES public.global_menus(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES public.global_menu_categories(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url       TEXT,
  is_veg          BOOLEAN DEFAULT true,
  is_must_try     BOOLEAN DEFAULT false,
  is_available    BOOLEAN DEFAULT true,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track which outlets are assigned a given global menu.
CREATE TABLE IF NOT EXISTS public.global_menu_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_menu_id  UUID NOT NULL REFERENCES public.global_menus(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (global_menu_id, tenant_id)
);

-- Link outlet menu items/categories back to global source for sync tracking.
ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS global_category_id UUID REFERENCES public.global_menu_categories(id) ON DELETE SET NULL;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS global_item_id UUID REFERENCES public.global_menu_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_override BOOLEAN NOT NULL DEFAULT false;

-- ========================================================================
-- RPC: sync a global menu to a specific outlet
-- Upserts categories and items from the template into the outlet's local
-- tables. Items marked is_override = true keep their local values.
-- ========================================================================
CREATE OR REPLACE FUNCTION public.sync_global_menu_to_outlet(
  p_global_menu_id UUID,
  p_tenant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_tenant_org UUID;
  v_cat RECORD;
  v_item RECORD;
  v_local_cat_id UUID;
  v_cats_synced INT := 0;
  v_items_synced INT := 0;
  v_items_skipped INT := 0;
BEGIN
  -- Verify the global menu belongs to the same org as the tenant.
  SELECT organization_id INTO v_org_id
    FROM public.global_menus WHERE id = p_global_menu_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Global menu not found';
  END IF;

  SELECT organization_id INTO v_tenant_org
    FROM public.tenants WHERE id = p_tenant_id;
  IF v_tenant_org IS NULL OR v_tenant_org != v_org_id THEN
    RAISE EXCEPTION 'Outlet does not belong to this organization';
  END IF;

  -- Sync categories
  FOR v_cat IN
    SELECT id, name, image_url, sort_order
      FROM public.global_menu_categories
     WHERE global_menu_id = p_global_menu_id
     ORDER BY sort_order
  LOOP
    INSERT INTO public.menu_categories (tenant_id, name, image_url, sort_order, global_category_id)
    VALUES (p_tenant_id, v_cat.name, v_cat.image_url, v_cat.sort_order, v_cat.id)
    ON CONFLICT (tenant_id, global_category_id)
      WHERE global_category_id IS NOT NULL
      DO UPDATE SET name = EXCLUDED.name, image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_local_cat_id;
    v_cats_synced := v_cats_synced + 1;

    -- Sync items in this category
    FOR v_item IN
      SELECT id, name, description, price, image_url, is_veg, is_must_try, is_available, sort_order
        FROM public.global_menu_items
       WHERE category_id = v_cat.id
       ORDER BY sort_order
    LOOP
      -- Skip items that have been overridden locally
      IF EXISTS (
        SELECT 1 FROM public.menu_items
         WHERE tenant_id = p_tenant_id AND global_item_id = v_item.id AND is_override = true
      ) THEN
        v_items_skipped := v_items_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.menu_items
        (tenant_id, category_id, name, description, price, image_url, is_veg, is_must_try, is_available, sort_order, global_item_id)
      VALUES
        (p_tenant_id, v_local_cat_id, v_item.name, v_item.description, v_item.price,
         v_item.image_url, v_item.is_veg, v_item.is_must_try, v_item.is_available, v_item.sort_order, v_item.id)
      ON CONFLICT (tenant_id, global_item_id)
        WHERE global_item_id IS NOT NULL
        DO UPDATE SET
          category_id = EXCLUDED.category_id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          image_url = EXCLUDED.image_url,
          is_veg = EXCLUDED.is_veg,
          is_must_try = EXCLUDED.is_must_try,
          is_available = EXCLUDED.is_available,
          sort_order = EXCLUDED.sort_order;

      v_items_synced := v_items_synced + 1;
    END LOOP;
  END LOOP;

  -- Also sync uncategorized items (category_id IS NULL)
  FOR v_item IN
    SELECT id, name, description, price, image_url, is_veg, is_must_try, is_available, sort_order
      FROM public.global_menu_items
     WHERE global_menu_id = p_global_menu_id AND category_id IS NULL
     ORDER BY sort_order
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.menu_items
       WHERE tenant_id = p_tenant_id AND global_item_id = v_item.id AND is_override = true
    ) THEN
      v_items_skipped := v_items_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.menu_items
      (tenant_id, category_id, name, description, price, image_url, is_veg, is_must_try, is_available, sort_order, global_item_id)
    VALUES
      (p_tenant_id, NULL, v_item.name, v_item.description, v_item.price,
       v_item.image_url, v_item.is_veg, v_item.is_must_try, v_item.is_available, v_item.sort_order, v_item.id)
    ON CONFLICT (tenant_id, global_item_id)
      WHERE global_item_id IS NOT NULL
      DO UPDATE SET
        category_id = EXCLUDED.category_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        image_url = EXCLUDED.image_url,
        is_veg = EXCLUDED.is_veg,
        is_must_try = EXCLUDED.is_must_try,
        is_available = EXCLUDED.is_available,
        sort_order = EXCLUDED.sort_order;

    v_items_synced := v_items_synced + 1;
  END LOOP;

  -- Update assignment sync timestamp
  UPDATE public.global_menu_assignments
     SET last_synced_at = now()
   WHERE global_menu_id = p_global_menu_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'categories_synced', v_cats_synced,
    'items_synced', v_items_synced,
    'items_skipped', v_items_skipped
  );
END;
$$;

-- Unique partial indexes for the ON CONFLICT clauses above.
CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_tenant_global_cat
  ON public.menu_categories (tenant_id, global_category_id)
  WHERE global_category_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_tenant_global_item
  ON public.menu_items (tenant_id, global_item_id)
  WHERE global_item_id IS NOT NULL;

-- ========================================================================
-- RLS policies  (owner of the organization can CRUD)
-- ========================================================================
ALTER TABLE public.global_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_menu_assignments ENABLE ROW LEVEL SECURITY;

-- Owner can manage their org's global menus
CREATE POLICY "global_menus owner" ON public.global_menus FOR ALL
  USING (organization_id IN (
    SELECT id FROM public.organizations WHERE owner_id = auth.uid()
  ));

CREATE POLICY "global_menu_categories owner" ON public.global_menu_categories FOR ALL
  USING (global_menu_id IN (
    SELECT gm.id FROM public.global_menus gm
      JOIN public.organizations o ON o.id = gm.organization_id
     WHERE o.owner_id = auth.uid()
  ));

CREATE POLICY "global_menu_items owner" ON public.global_menu_items FOR ALL
  USING (global_menu_id IN (
    SELECT gm.id FROM public.global_menus gm
      JOIN public.organizations o ON o.id = gm.organization_id
     WHERE o.owner_id = auth.uid()
  ));

CREATE POLICY "global_menu_assignments owner" ON public.global_menu_assignments FOR ALL
  USING (global_menu_id IN (
    SELECT gm.id FROM public.global_menus gm
      JOIN public.organizations o ON o.id = gm.organization_id
     WHERE o.owner_id = auth.uid()
  ));

-- Super admin can do everything
CREATE POLICY "global_menus super" ON public.global_menus FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "global_menu_categories super" ON public.global_menu_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "global_menu_items super" ON public.global_menu_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "global_menu_assignments super" ON public.global_menu_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

-- Grants
GRANT ALL ON public.global_menus TO authenticated;
GRANT ALL ON public.global_menu_categories TO authenticated;
GRANT ALL ON public.global_menu_items TO authenticated;
GRANT ALL ON public.global_menu_assignments TO authenticated;
