-- OXANA PROJECTS — Stage 2: brief fields, submissions, answers + public RPCs
-- Run manually in Supabase SQL Editor after client-projects.sql
-- Does NOT modify portfolio tables or Stage 1 tokens.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- brief_fields
-- ---------------------------------------------------------------------------
create table if not exists public.brief_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.client_projects (id) on delete cascade,
  label text not null,
  field_key text not null,
  field_type text not null,
  placeholder text,
  help_text text,
  required boolean not null default false,
  options jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint brief_fields_project_field_key_unique unique (project_id, field_key),
  constraint brief_fields_field_key_format check (
    field_key ~ '^[a-z0-9_]+$'
  )
);

create index if not exists brief_fields_project_id_idx
  on public.brief_fields (project_id);

create index if not exists brief_fields_sort_order_idx
  on public.brief_fields (project_id, sort_order);

-- ---------------------------------------------------------------------------
-- brief_submissions
-- ---------------------------------------------------------------------------
create table if not exists public.brief_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.client_projects (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brief_submissions_project_id_idx
  on public.brief_submissions (project_id);

create index if not exists brief_submissions_status_idx
  on public.brief_submissions (project_id, status);

drop trigger if exists brief_submissions_set_updated_at on public.brief_submissions;
create trigger brief_submissions_set_updated_at
before update on public.brief_submissions
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- brief_answers
-- ---------------------------------------------------------------------------
create table if not exists public.brief_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.brief_submissions (id) on delete cascade,
  project_id uuid not null references public.client_projects (id) on delete cascade,
  field_key text not null,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brief_answers_submission_field_key_unique unique (submission_id, field_key)
);

create index if not exists brief_answers_submission_id_idx
  on public.brief_answers (submission_id);

create index if not exists brief_answers_project_id_idx
  on public.brief_answers (project_id);

drop trigger if exists brief_answers_set_updated_at on public.brief_answers;
create trigger brief_answers_set_updated_at
before update on public.brief_answers
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.brief_fields enable row level security;
alter table public.brief_submissions enable row level security;
alter table public.brief_answers enable row level security;

drop policy if exists "Authenticated can manage brief fields" on public.brief_fields;
create policy "Authenticated can manage brief fields"
on public.brief_fields
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can manage brief submissions" on public.brief_submissions;
create policy "Authenticated can manage brief submissions"
on public.brief_submissions
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can manage brief answers" on public.brief_answers;
create policy "Authenticated can manage brief answers"
on public.brief_answers
for all
to authenticated
using (true)
with check (true);

-- Anon: no direct table access. Public ops go through SECURITY DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._brief_project_by_token(p_token text)
returns table (
  id uuid,
  title text,
  project_type text,
  status text,
  client_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.id,
    cp.title,
    cp.project_type,
    cp.status,
    c.name as client_name
  from public.client_projects cp
  join public.clients c on c.id = cp.client_id
  where cp.brief_token = p_token
  limit 1;
$$;

create or replace function public._upsert_brief_answers(
  p_submission_id uuid,
  p_project_id uuid,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return;
  end if;

  for r in
    select key, value
    from jsonb_each(p_answers)
  loop
    insert into public.brief_answers (
      submission_id,
      project_id,
      field_key,
      value
    )
    values (
      p_submission_id,
      p_project_id,
      r.key,
      r.value
    )
    on conflict (submission_id, field_key)
    do update set
      value = excluded.value,
      updated_at = now();
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPC: get brief by token
-- ---------------------------------------------------------------------------
create or replace function public.get_public_brief(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_submission record;
  v_fields jsonb;
  v_answers jsonb;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_project
  from public._brief_project_by_token(trim(p_token));

  if v_project.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', bf.id,
        'label', bf.label,
        'fieldKey', bf.field_key,
        'fieldType', bf.field_type,
        'placeholder', bf.placeholder,
        'helpText', bf.help_text,
        'required', bf.required,
        'options', bf.options,
        'sortOrder', bf.sort_order
      )
      order by bf.sort_order asc, bf.created_at asc
    ),
    '[]'::jsonb
  )
  into v_fields
  from public.brief_fields bf
  where bf.project_id = v_project.id;

  select *
  into v_submission
  from public.brief_submissions bs
  where bs.project_id = v_project.id
  order by
    case when bs.status = 'submitted' then 0 else 1 end,
    bs.updated_at desc
  limit 1;

  if v_submission.id is not null then
    select coalesce(
      (
        select jsonb_object_agg(ba.field_key, ba.value)
        from public.brief_answers ba
        where ba.submission_id = v_submission.id
      ),
      '{}'::jsonb
    )
    into v_answers;
  else
    v_answers := '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'ok', true,
    'project', jsonb_build_object(
      'title', v_project.title,
      'projectType', v_project.project_type,
      'status', v_project.status,
      'clientName', v_project.client_name
    ),
    'fields', v_fields,
    'submission', case
      when v_submission.id is null then null
      else jsonb_build_object(
        'status', v_submission.status,
        'submittedAt', v_submission.submitted_at,
        'updatedAt', v_submission.updated_at
      )
    end,
    'answers', v_answers
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPC: save draft
-- ---------------------------------------------------------------------------
create or replace function public.save_public_brief_draft(
  p_token text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_submission_id uuid;
  v_status text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_project
  from public._brief_project_by_token(trim(p_token));

  if v_project.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select id, status into v_submission_id, v_status
  from public.brief_submissions
  where project_id = v_project.id
  order by
    case when status = 'submitted' then 0 else 1 end,
    updated_at desc
  limit 1;

  if v_status = 'submitted' then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end if;

  if v_submission_id is null then
    insert into public.brief_submissions (project_id, status)
    values (v_project.id, 'draft')
    returning id into v_submission_id;
  end if;

  perform public._upsert_brief_answers(v_submission_id, v_project.id, p_answers);

  update public.brief_submissions
  set updated_at = now()
  where id = v_submission_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'draft',
    'updatedAt', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPC: submit brief
-- ---------------------------------------------------------------------------
create or replace function public.submit_public_brief(
  p_token text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_submission_id uuid;
  v_status text;
  v_field record;
  v_value jsonb;
  v_missing text[] := '{}';
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_project
  from public._brief_project_by_token(trim(p_token));

  if v_project.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select id, status into v_submission_id, v_status
  from public.brief_submissions
  where project_id = v_project.id
  order by
    case when status = 'submitted' then 0 else 1 end,
    updated_at desc
  limit 1;

  if v_status = 'submitted' then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end if;

  for v_field in
    select field_key, label, required, field_type
    from public.brief_fields
    where project_id = v_project.id
      and required = true
  loop
    v_value := p_answers -> v_field.field_key;
    if v_value is null
      or v_value = 'null'::jsonb
      or v_value = '""'::jsonb
      or v_value = '[]'::jsonb
      or v_value = 'false'::jsonb
    then
      v_missing := array_append(v_missing, v_field.label);
    end if;
  end loop;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'validation_failed',
      'missing', to_jsonb(v_missing)
    );
  end if;

  if v_submission_id is null then
    insert into public.brief_submissions (project_id, status, submitted_at)
    values (v_project.id, 'submitted', now())
    returning id into v_submission_id;
  else
    update public.brief_submissions
    set
      status = 'submitted',
      submitted_at = now(),
      updated_at = now()
    where id = v_submission_id;
  end if;

  perform public._upsert_brief_answers(v_submission_id, v_project.id, p_answers);

  update public.client_projects
  set status = 'Бриф заполнен'
  where id = v_project.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'submitted',
    'submittedAt', now()
  );
end;
$$;

revoke all on function public._brief_project_by_token(text) from public;
revoke all on function public._upsert_brief_answers(uuid, uuid, jsonb) from public;

grant execute on function public.get_public_brief(text) to anon, authenticated;
grant execute on function public.save_public_brief_draft(text, jsonb) to anon, authenticated;
grant execute on function public.submit_public_brief(text, jsonb) to anon, authenticated;
