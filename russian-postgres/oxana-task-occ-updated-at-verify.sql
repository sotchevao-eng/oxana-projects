-- OXANA AI — read-only checks after oxana-task-occ-updated-at.sql.
-- SELECT only. Does not read PII. Does not ALTER existing task rows.

select
  current_database() as database,
  current_user as db_user;

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

-- Expected:
-- projects | oxana_projects_set_updated_at | set_updated_at
-- tasks    | oxana_tasks_set_updated_at    | set_task_updated_at

select
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'oxana'
  and p.proname in ('set_updated_at', 'set_task_updated_at')
order by p.proname;

-- set_updated_at must still contain `new.updated_at = now();`
-- set_task_updated_at must contain `old.updated_at + interval '1 millisecond'`

select
  has_function_privilege(
    'oxana_app',
    'oxana.set_task_updated_at()',
    'EXECUTE'
  ) as oxana_app_can_execute_task_fn,
  has_table_privilege('oxana_app', 'oxana.tasks', 'UPDATE')
    as oxana_app_can_update_tasks,
  has_table_privilege('oxana_app', 'public.client_pii', 'SELECT') as pii_select;
