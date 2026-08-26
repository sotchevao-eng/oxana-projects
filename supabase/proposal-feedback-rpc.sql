-- OXANA PROJECTS — Stage 3.4: accept / request changes RPCs
-- Run manually in Supabase SQL Editor AFTER proposals-module.sql and proposal-public-rpc.sql
-- Does NOT grant anon direct INSERT/UPDATE on proposals / proposal_feedback / client_projects.

-- ---------------------------------------------------------------------------
-- Update get_public_proposal: allow viewing after accept / changes_requested
-- (still requires published = true; never returns tokens/UUIDs/contacts)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_proposal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_client record;
  v_proposal record;
  v_sections jsonb;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  end if;

  select
    cp.id,
    cp.title,
    cp.project_type,
    cp.client_id
  into v_project
  from public.client_projects cp
  where cp.proposal_token = trim(p_token)
  limit 1;

  if v_project.id is null then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  end if;

  select
    p.id,
    p.title,
    p.subtitle,
    p.intro,
    p.price,
    p.deadline,
    p.status,
    p.published
  into v_proposal
  from public.proposals p
  where p.project_id = v_project.id
  limit 1;

  if v_proposal.id is null
     or v_proposal.published is distinct from true
     or v_proposal.status not in ('published', 'accepted', 'changes_requested') then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_published');
  end if;

  select
    c.name,
    c.company
  into v_client
  from public.clients c
  where c.id = v_project.client_id
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'section_type', ps.section_type,
        'title', ps.title,
        'content', ps.content,
        'sort_order', ps.sort_order
      )
      order by ps.sort_order asc
    ),
    '[]'::jsonb
  )
  into v_sections
  from public.proposal_sections ps
  where ps.proposal_id = v_proposal.id
    and ps.visible = true;

  return jsonb_build_object(
    'ok', true,
    'project', jsonb_build_object(
      'title', v_project.title,
      'project_type', v_project.project_type
    ),
    'client', jsonb_build_object(
      'name', v_client.name,
      'company', v_client.company
    ),
    'proposal', jsonb_build_object(
      'title', v_proposal.title,
      'subtitle', v_proposal.subtitle,
      'intro', v_proposal.intro,
      'price', v_proposal.price,
      'deadline', v_proposal.deadline,
      'status', v_proposal.status
    ),
    'sections', v_sections
  );
end;
$$;

revoke all on function public.get_public_proposal(text) from public;
grant execute on function public.get_public_proposal(text) to anon;
grant execute on function public.get_public_proposal(text) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_public_proposal
-- ---------------------------------------------------------------------------
create or replace function public.accept_public_proposal(
  p_token text,
  p_name text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_proposal record;
  v_name text;
  v_comment text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  end if;

  v_name := trim(coalesce(p_name, ''));
  v_comment := trim(coalesce(p_comment, ''));

  if length(v_name) < 1 or length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'validation_failed');
  end if;

  if length(v_comment) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'validation_failed');
  end if;

  select cp.id
  into v_project_id
  from public.client_projects cp
  where cp.proposal_token = trim(p_token)
  limit 1;

  if v_project_id is null then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  end if;

  select
    p.id,
    p.status,
    p.published
  into v_proposal
  from public.proposals p
  where p.project_id = v_project_id
  limit 1;

  if v_proposal.id is null then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  end if;

  if v_proposal.published is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_published');
  end if;

  if v_proposal.status = 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'proposal_already_accepted');
  end if;

  if v_proposal.status not in ('published', 'changes_requested') then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_published');
  end if;

  insert into public.proposal_feedback (proposal_id, action, name, comment)
  values (
    v_proposal.id,
    'accepted',
    v_name,
    nullif(v_comment, '')
  );

  update public.proposals
  set
    status = 'accepted',
    accepted_at = now(),
    updated_at = now()
  where id = v_proposal.id;

  update public.client_projects
  set
    status = 'КП принято',
    updated_at = now()
  where id = v_project_id;

  return jsonb_build_object('ok', true, 'status', 'accepted');
end;
$$;

revoke all on function public.accept_public_proposal(text, text, text) from public;
grant execute on function public.accept_public_proposal(text, text, text) to anon;
grant execute on function public.accept_public_proposal(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- request_proposal_changes
-- ---------------------------------------------------------------------------
create or replace function public.request_proposal_changes(
  p_token text,
  p_name text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_proposal record;
  v_name text;
  v_comment text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  end if;

  v_name := trim(coalesce(p_name, ''));
  v_comment := trim(coalesce(p_comment, ''));

  if length(v_name) < 1 or length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'validation_failed');
  end if;

  if length(v_comment) < 1 or length(v_comment) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'validation_failed');
  end if;

  select cp.id
  into v_project_id
  from public.client_projects cp
  where cp.proposal_token = trim(p_token)
  limit 1;

  if v_project_id is null then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  end if;

  select
    p.id,
    p.status,
    p.published
  into v_proposal
  from public.proposals p
  where p.project_id = v_project_id
  limit 1;

  if v_proposal.id is null then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  end if;

  if v_proposal.published is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_published');
  end if;

  if v_proposal.status = 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'proposal_already_accepted');
  end if;

  if v_proposal.status not in ('published', 'changes_requested') then
    return jsonb_build_object('ok', false, 'error', 'proposal_not_published');
  end if;

  insert into public.proposal_feedback (proposal_id, action, name, comment)
  values (
    v_proposal.id,
    'changes_requested',
    v_name,
    v_comment
  );

  update public.proposals
  set
    status = 'changes_requested',
    changes_requested_at = now(),
    updated_at = now()
  where id = v_proposal.id;

  update public.client_projects
  set
    status = 'Нужны изменения',
    updated_at = now()
  where id = v_project_id;

  return jsonb_build_object('ok', true, 'status', 'changes_requested');
end;
$$;

revoke all on function public.request_proposal_changes(text, text, text) from public;
grant execute on function public.request_proposal_changes(text, text, text) to anon;
grant execute on function public.request_proposal_changes(text, text, text) to authenticated;
