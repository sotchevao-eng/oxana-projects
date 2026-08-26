-- OXANA PROJECTS — Stage 3.2: public proposal RPC
-- Run manually in Supabase SQL Editor AFTER proposals-module.sql
-- Does NOT modify proposal_token or portfolio tables.
-- Does NOT grant anon direct SELECT on client_projects / clients / proposals / proposal_sections.

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
