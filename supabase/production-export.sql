-- READ-ONLY. Run on PRODUCTION (SQL Editor) to print the pieces of setup that
-- `supabase db dump` leaves out, as SQL you then run on STAGING.
-- Nothing here writes; every statement is a SELECT.
-- See docs/supabase-environments.md → "Build the staging schema".

-- 1. Storage policies on storage.objects (dump covers the public schema only).
--    Copy the "ddl" column of every row into staging-bootstrap.sql section 3, or run directly on staging.
select format(
  'create policy %I on storage.objects as %s for %s to %s%s%s;',
  policyname,
  permissive,
  cmd,
  array_to_string(roles, ', '),
  case when qual is not null then ' using (' || qual || ')' else '' end,
  case when with_check is not null then ' with check (' || with_check || ')' else '' end
) as ddl
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 2. Storage buckets (staging-bootstrap.sql creates the two known ones; check nothing else exists).
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

-- 3. Triggers on auth.users (staging-bootstrap.sql recreates on_auth_user_created; check there are no others).
select tgname, pg_get_triggerdef(oid) as ddl
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- 4. Cron jobs, for reference only. Do NOT copy whatsapp-dispatch or notify-* to staging as-is:
--    they would call production's dispatcher / send real messages.
select jobname, schedule, left(command, 120) as command_start from cron.job order by jobname;

-- 5. Realtime publication (Database → Publications on staging should list the same tables).
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
