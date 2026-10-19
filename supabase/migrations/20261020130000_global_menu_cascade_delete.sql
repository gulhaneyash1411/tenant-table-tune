-- Change global menu link FKs from SET NULL to CASCADE so that deleting a
-- global category or item also removes the synced copies in every outlet.

-- menu_categories.global_category_id: SET NULL → CASCADE
ALTER TABLE public.menu_categories
  DROP CONSTRAINT IF EXISTS menu_categories_global_category_id_fkey;

ALTER TABLE public.menu_categories
  ADD CONSTRAINT menu_categories_global_category_id_fkey
    FOREIGN KEY (global_category_id)
    REFERENCES public.global_menu_categories(id)
    ON DELETE CASCADE;

-- menu_items.global_item_id: SET NULL → CASCADE
ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_global_item_id_fkey;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_global_item_id_fkey
    FOREIGN KEY (global_item_id)
    REFERENCES public.global_menu_items(id)
    ON DELETE CASCADE;
