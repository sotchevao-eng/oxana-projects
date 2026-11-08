-- OXANA AI — rollback for oxana-task-occ-updated-at.sql.
-- STATUS: NOT APPLIED. Restores the tasks trigger to oxana.set_updated_at().
-- Does not drop or replace oxana.set_updated_at. Does not touch projects,
-- events, PII, or task row data.

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
  if to_regprocedure('oxana.set_updated_at()') is null then
    raise exception 'oxana.set_updated_at() is required to restore the tasks trigger';
  end if;
end
$oxana$;

drop trigger if exists oxana_tasks_set_updated_at on oxana.tasks;
create trigger oxana_tasks_set_updated_at
before update on oxana.tasks
for each row
execute function oxana.set_updated_at();

drop function if exists oxana.set_task_updated_at();

commit;
