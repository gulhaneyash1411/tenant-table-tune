-- Replace the sync function to match categories and items by name when no
-- global link exists yet, preventing duplicates on first sync.
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
  v_existing_cat_id UUID;
  v_existing_item_id UUID;
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
    -- Check if already linked by global_category_id
    SELECT id INTO v_existing_cat_id
      FROM public.menu_categories
     WHERE tenant_id = p_tenant_id AND global_category_id = v_cat.id;

    IF v_existing_cat_id IS NOT NULL THEN
      -- Already linked: update it
      UPDATE public.menu_categories
         SET name = v_cat.name, image_url = v_cat.image_url, sort_order = v_cat.sort_order
       WHERE id = v_existing_cat_id;
      v_local_cat_id := v_existing_cat_id;
    ELSE
      -- Check if a category with the same name exists (no global link)
      SELECT id INTO v_existing_cat_id
        FROM public.menu_categories
       WHERE tenant_id = p_tenant_id
         AND lower(trim(name)) = lower(trim(v_cat.name))
         AND global_category_id IS NULL
       LIMIT 1;

      IF v_existing_cat_id IS NOT NULL THEN
        -- Adopt the existing category: link it and update
        UPDATE public.menu_categories
           SET global_category_id = v_cat.id,
               image_url = COALESCE(v_cat.image_url, image_url),
               sort_order = v_cat.sort_order
         WHERE id = v_existing_cat_id;
        v_local_cat_id := v_existing_cat_id;
      ELSE
        -- No match: insert new
        INSERT INTO public.menu_categories (tenant_id, name, image_url, sort_order, global_category_id)
        VALUES (p_tenant_id, v_cat.name, v_cat.image_url, v_cat.sort_order, v_cat.id)
        RETURNING id INTO v_local_cat_id;
      END IF;
    END IF;

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

      -- Check if already linked by global_item_id
      SELECT id INTO v_existing_item_id
        FROM public.menu_items
       WHERE tenant_id = p_tenant_id AND global_item_id = v_item.id;

      IF v_existing_item_id IS NOT NULL THEN
        -- Already linked: update it
        UPDATE public.menu_items
           SET category_id = v_local_cat_id,
               name = v_item.name, description = v_item.description,
               price = v_item.price, image_url = v_item.image_url,
               is_veg = v_item.is_veg, is_must_try = v_item.is_must_try,
               is_available = v_item.is_available, sort_order = v_item.sort_order
         WHERE id = v_existing_item_id;
      ELSE
        -- Check if an item with the same name exists in the same local category (no global link)
        SELECT id INTO v_existing_item_id
          FROM public.menu_items
         WHERE tenant_id = p_tenant_id
           AND category_id = v_local_cat_id
           AND lower(trim(name)) = lower(trim(v_item.name))
           AND global_item_id IS NULL
         LIMIT 1;

        IF v_existing_item_id IS NOT NULL THEN
          -- Adopt the existing item: link it and update
          UPDATE public.menu_items
             SET global_item_id = v_item.id,
                 description = COALESCE(v_item.description, description),
                 price = v_item.price, image_url = COALESCE(v_item.image_url, image_url),
                 is_veg = v_item.is_veg, is_must_try = v_item.is_must_try,
                 is_available = v_item.is_available, sort_order = v_item.sort_order
           WHERE id = v_existing_item_id;
        ELSE
          -- No match: insert new
          INSERT INTO public.menu_items
            (tenant_id, category_id, name, description, price, image_url,
             is_veg, is_must_try, is_available, sort_order, global_item_id)
          VALUES
            (p_tenant_id, v_local_cat_id, v_item.name, v_item.description, v_item.price,
             v_item.image_url, v_item.is_veg, v_item.is_must_try, v_item.is_available,
             v_item.sort_order, v_item.id);
        END IF;
      END IF;

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

    SELECT id INTO v_existing_item_id
      FROM public.menu_items
     WHERE tenant_id = p_tenant_id AND global_item_id = v_item.id;

    IF v_existing_item_id IS NOT NULL THEN
      UPDATE public.menu_items
         SET category_id = NULL,
             name = v_item.name, description = v_item.description,
             price = v_item.price, image_url = v_item.image_url,
             is_veg = v_item.is_veg, is_must_try = v_item.is_must_try,
             is_available = v_item.is_available, sort_order = v_item.sort_order
       WHERE id = v_existing_item_id;
    ELSE
      -- Check by name (uncategorized items)
      SELECT id INTO v_existing_item_id
        FROM public.menu_items
       WHERE tenant_id = p_tenant_id
         AND category_id IS NULL
         AND lower(trim(name)) = lower(trim(v_item.name))
         AND global_item_id IS NULL
       LIMIT 1;

      IF v_existing_item_id IS NOT NULL THEN
        UPDATE public.menu_items
           SET global_item_id = v_item.id,
               description = COALESCE(v_item.description, description),
               price = v_item.price, image_url = COALESCE(v_item.image_url, image_url),
               is_veg = v_item.is_veg, is_must_try = v_item.is_must_try,
               is_available = v_item.is_available, sort_order = v_item.sort_order
         WHERE id = v_existing_item_id;
      ELSE
        INSERT INTO public.menu_items
          (tenant_id, category_id, name, description, price, image_url,
           is_veg, is_must_try, is_available, sort_order, global_item_id)
        VALUES
          (p_tenant_id, NULL, v_item.name, v_item.description, v_item.price,
           v_item.image_url, v_item.is_veg, v_item.is_must_try, v_item.is_available,
           v_item.sort_order, v_item.id);
      END IF;
    END IF;

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
