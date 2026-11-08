-- OXANA AI — read-only precheck before oxana-task-occ-updated-at.sql.
-- SELECT only. Does not read PII. Does not ALTER/DROP/GRANT.
-- Run as gen_user on default_db. Do not apply the migration from this file.
--
-- Expected before apply:
--   database = default_db
--   tasks_exist = true, projects_exist = true
--   can_replace_task_trigger = true
--   shared_fn = set_updated_at (projects keep this)
--   pii_select = false

select
  current_database() as database,
  current_user as db_user,
  current_setting('server_version') as server_version,
  to_regclass('oxana.tasks') is not null as tasks_exist,
  to_regclass('oxana.projects') is not null as projects_exist,
  to_regprocedure('oxana.set_updated_at()') is not null as shared_fn_exists,
  to_regprocedure('oxana.set_task_updated_at()') is not null
    as task_fn_already_present,
  has_table_privilege(current_user, 'oxana.tasks', 'TRIGGER')
    as can_replace_task_trigger,
  has_schema_privilege(current_user, 'oxana', 'CREATE') as can_create_in_oxana;

select
  c.relname as table_name,
  pg_catalog.pg_get_userbyid(c.relowner) as table_owner,
  has_table_privilege(current_user, 'oxana.' || c.relname, 'TRIGGER')
    as current_user_has_trigger
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'oxana'
  and c.relkind = 'r'
  and c.relname in ('tasks', 'projects')
order by c.relname;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'oxana'
  and p.proname in ('set_updated_at', 'set_task_updated_at')
order by p.proname;

select
  c.relname as table_name,
  t.tgname as trigger_name,
  p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'oxana'
  and not t.tgisinternal
  and c.relname in ('tasks', 'projects')
order by c.relname, t.tgname;

select
  exists (select 1 from pg_roles where rolname = 'oxana_app') as oxana_app_exists,
  has_table_privilege('oxana_app', 'oxana.tasks', 'UPDATE')
    as oxana_app_can_update_tasks;

select
  has_table_privilege('oxana_app', 'public.client_pii', 'SELECT') as pii_select,
  has_table_privilege('oxana_app', 'public.brief_pii_answers', 'SELECT')
    as brief_select;
