-- OXANA AI — durable idempotency keys for POST /api/oxana/tasks.
-- STATUS: NOT APPLIED. Do not run against the live Timeweb database
-- until a separate written approval. This file is a prepared migration only.
--
-- Run later as gen_user on database default_db, whole file in one Adminer session.
-- Schema oxana only. Creates one table and two indexes. Does not ALTER/DROP
-- existing tables. No CRM, Auth, public.client_pii, or public.brief_pii_answers.
-- No DELETE/TRUNCATE of cabinet rows.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- GRANT is limited to oxana.task_create_keys for role oxana_app.
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
  if not exists (select 1 from pg_roles where rolname = 'oxana_app') then
    raise exception 'role oxana_app is required before granting oxana.task_create_keys';
  end if;
end
$oxana$;

create table if not exists oxana.task_create_keys (
  user_id uuid not null,
  idempotency_key uuid not null,
  workspace_id uuid not null,
  request_hash text not null
    check (char_length(request_hash) = 64 and request_hash ~ '^[0-9a-f]+$'),
  task_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key),
  constraint oxana_task_create_keys_user_fkey
    foreign key (user_id) references oxana.identities (user_id) on delete cascade,
  constraint oxana_task_create_keys_workspace_fkey
    foreign key (workspace_id) references oxana.workspaces (id) on delete cascade,
  constraint oxana_task_create_keys_task_fkey
    foreign key (task_id) references oxana.tasks (id) on delete set null
);

comment on table oxana.task_create_keys is
  'Consumed HTTP idempotency keys for task create. request_hash is SHA-256 hex of canonical title, description, dueAt, projectId, priority.';

comment on column oxana.task_create_keys.request_hash is
  'SHA-256 hex of the canonical create payload. Same key + different hash is rejected.';

comment on column oxana.task_create_keys.task_id is
  'Created task. NULL after the task is deleted; the key stays consumed so a retry cannot insert another row.';

create index if not exists oxana_task_create_keys_task_idx
  on oxana.task_create_keys (task_id);

create index if not exists oxana_task_create_keys_created_idx
  on oxana.task_create_keys (created_at);

grant select, insert, update on table oxana.task_create_keys to oxana_app;
revoke delete on table oxana.task_create_keys from oxana_app;

commit;
