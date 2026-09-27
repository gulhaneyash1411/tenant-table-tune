// src/lib/nav-db.ts
//
// The generated Supabase types (src/integrations/supabase/types.ts) don't yet
// know about nav_defaults / tenant_nav_overrides, so `supabase.from("...")`
// fails to type-check against the table-name union.
//
// This is a loosely-typed view of the same client, used ONLY for those two
// tables. Delete this file and import `supabase` directly once you run:
//
//   npx supabase gen types typescript --project-id <ref> \
//     > src/integrations/supabase/types.ts

import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Same runtime client, with the table-name check relaxed. */
export const navDb = supabase as unknown as SupabaseClient<any, "public", any>;

/** Shape of a row in either nav table. */
export type NavRow = {
  key: string;
  enabled: boolean | null;
  label: string | null;
};