-- OXANA AI — task-only updated_at bump for PATCH OCC.
-- STATUS: NOT APPLIED. Do not run against the live Timeweb database
-- until a separate written approval. This file is a prepared migration only.
--
-- Replaces only the BEFORE UPDATE trigger on oxana.tasks.
-- Does not replace oxana.set_updated_at() used by oxana.projects.
-- Does not touch events, PII, CRM, Auth, or public schema.
-- Safe to re-run: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER.
--
-- Isolated tests may set oxana.allow_isolated_test=on before this script.
-- Production Adminer must not set that GUC; production DB must be default_db.

begin;

do $oxana$
begin
  if current_database() is distinct from 'default_db'
     and current_setting('oxana.allow_isolated_test', true) is distinct from 'on' then
    raise exception 'expected database default_db, got %', current_database();
  end if;
  if to_regclass('oxana.tasks') is null then
    raise exception 'oxana.tasks is required';
  end if;
end
$oxana$;

create or replace function oxana.set_task_updated_at()
returns trigger
language plpgsql
set search_path = oxana, pg_catalog
as $$
begin
  new.updated_at = greatest(
    clock_timestamp(),
    old.updated_at + interval '1 millisecond'
  );
  return new;
end;
$$;

drop trigger if exists oxana_tasks_set_updated_at on oxana.tasks;
create trigger oxana_tasks_set_updated_at
before update on oxana.tasks
for each row
execute function oxana.set_task_updated_at();

do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'oxana_app') then
    execute 'grant execute on function oxana.set_task_updated_at() to oxana_app';
  end if;
end
$grant$;

commit;
