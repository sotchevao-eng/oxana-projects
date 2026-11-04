import { getOxanaPool, closeOxanaPool } from '../src/oxana/db.js'

const pool = getOxanaPool()

async function rows(sql: string) {
  const result = await pool.query(sql)
  return result.rows
}

try {
  const session = await rows(`
    select
      current_database() as database,
      current_user as db_user,
      version() as version,
      current_setting('server_version_num') as version_num,
      current_setting('TimeZone') as timezone
  `)
  const tables = await rows(`
    select table_name
    from information_schema.tables
    where table_schema = 'oxana'
    order by table_name
  `)
  const columns = await rows(`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'oxana'
      and table_name in ('tasks', 'projects', 'events', 'notifications')
    order by table_name, ordinal_position
  `)
  const checks = await rows(`
    select
      rel.relname as table_name,
      c.conname,
      pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'oxana'
      and rel.relname in ('tasks', 'projects', 'events', 'notifications')
    order by rel.relname, c.contype, c.conname
  `)
  const indexes = await rows(`
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname = 'oxana'
      and tablename in ('tasks', 'projects', 'events', 'notifications')
    order by tablename, indexname
  `)
  const triggers = await rows(`
    select event_object_table as table_name, trigger_name, action_timing, event_manipulation
    from information_schema.triggers
    where trigger_schema = 'oxana'
    order by event_object_table, trigger_name
  `)
  const counts = await rows(`
    select
      (select count(*)::int from oxana.tasks) as tasks,
      (select count(*)::int from oxana.projects) as projects,
      (select count(*)::int from oxana.events) as events,
      (select count(*)::int from oxana.notifications) as notifications,
      (select count(*)::int from oxana.workspaces) as workspaces
  `)
  const statuses = await rows(`
    select 'task' as kind, status, count(*)::int as n
    from oxana.tasks
    group by status
    union all
    select 'project', status, count(*)::int
    from oxana.projects
    group by status
    order by 1, 2
  `)
  const privileges = await rows(`
    select
      has_table_privilege(current_user, 'oxana.tasks', 'SELECT') as tasks_select,
      has_table_privilege(current_user, 'oxana.tasks', 'INSERT') as tasks_insert,
      has_table_privilege(current_user, 'oxana.tasks', 'UPDATE') as tasks_update,
      has_table_privilege(current_user, 'oxana.tasks', 'DELETE') as tasks_delete,
      has_table_privilege(current_user, 'oxana.tasks', 'TRUNCATE') as tasks_truncate,
      has_schema_privilege(current_user, 'oxana', 'CREATE') as oxana_create,
      has_database_privilege(current_user, current_database(), 'CREATE') as db_create
  `)
  const pii = await rows(`
    select
      to_regclass('public.client_pii') is not null as client_pii_exists,
      to_regclass('public.brief_pii_answers') is not null as brief_pii_exists
  `)
  let piiSelect = { client_pii_select: null as boolean | null, brief_select: null as boolean | null }
  try {
    const extra = await rows(`
      select
        has_table_privilege(current_user, 'public.client_pii', 'SELECT') as client_pii_select,
        has_table_privilege(current_user, 'public.brief_pii_answers', 'SELECT') as brief_select
    `)
    piiSelect = extra[0] as typeof piiSelect
  } catch {
    piiSelect = { client_pii_select: false, brief_select: false }
  }

  console.log(
    JSON.stringify(
      {
        session,
        tables: tables.map((row) => row.table_name),
        columns,
        checks,
        indexes,
        triggers,
        counts: counts[0],
        statuses,
        privileges: privileges[0],
        pii: { ...pii[0], ...piiSelect },
      },
      null,
      2,
    ),
  )
} finally {
  await closeOxanaPool()
}
