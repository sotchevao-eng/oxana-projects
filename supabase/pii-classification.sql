-- OXANA PROJECTS — PD.2: PII classification for brief fields
-- Run manually in Supabase SQL Editor AFTER brief-module.sql
-- Does NOT encrypt data. Does NOT grant anon new table access.
-- SQL is NOT applied automatically by the app.

alter table public.brief_fields
  add column if not exists is_personal_data boolean not null default false;

comment on column public.brief_fields.is_personal_data is
  'If true, the answer must not be sent to external AI services.';

-- Safe heuristic backfill (NOT the only protection — Edge sanitizer still applies)
update public.brief_fields
set is_personal_data = true
where is_personal_data = false
  and (
    field_type in ('email', 'phone')
    or field_key ~* '(^|_)(name|fio|full_name|first_name|last_name|contact_person|phone|telephone|email|e_?mail|messenger|telegram|whatsapp)(_|$)'
    or label ~* '(фио|имя|фамилия|отчество|телефон|почта|e-?mail|email|messenger|telegram|whatsapp|контактное лицо|контактный телефон)'
  );

-- Expose flag on public brief RPC (fields only; never email/phone of clients table)
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
        'sortOrder', bf.sort_order,
        'isPersonalData', coalesce(bf.is_personal_data, false)
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

revoke all on function public.get_public_brief(text) from public;
grant execute on function public.get_public_brief(text) to anon, authenticated;
