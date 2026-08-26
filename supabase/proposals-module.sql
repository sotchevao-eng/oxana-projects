-- OXANA PROJECTS — Stage 3.1: proposals module
-- Run manually in Supabase SQL Editor after client-projects.sql / brief-module.sql
-- Does NOT modify portfolio tables or brief Stage 2 tables.

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
-- proposals (one active proposal per client project)
-- ---------------------------------------------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.client_projects (id) on delete cascade,
  title text,
  subtitle text,
  intro text,
  price text,
  deadline text,
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'ready',
        'published',
        'accepted',
        'changes_requested',
        'archived'
      )
    ),
  published boolean not null default false,
  accepted_at timestamptz,
  changes_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposals_project_id_unique unique (project_id)
);

create index if not exists proposals_project_id_idx on public.proposals (project_id);
create index if not exists proposals_status_idx on public.proposals (status);
create index if not exists proposals_published_idx on public.proposals (published);

drop trigger if exists proposals_set_updated_at on public.proposals;
create trigger proposals_set_updated_at
before update on public.proposals
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- proposal_sections
-- ---------------------------------------------------------------------------
create table if not exists public.proposal_sections (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  section_type text not null,
  title text,
  content text,
  sort_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposal_sections_proposal_id_idx
  on public.proposal_sections (proposal_id);

create index if not exists proposal_sections_sort_order_idx
  on public.proposal_sections (proposal_id, sort_order);

drop trigger if exists proposal_sections_set_updated_at on public.proposal_sections;
create trigger proposal_sections_set_updated_at
before update on public.proposal_sections
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- proposal_feedback (used in Stage 3.4; created now for schema completeness)
-- ---------------------------------------------------------------------------
create table if not exists public.proposal_feedback (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  action text not null
    check (action in ('accepted', 'changes_requested')),
  name text,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists proposal_feedback_proposal_id_idx
  on public.proposal_feedback (proposal_id);

-- ---------------------------------------------------------------------------
-- ai_generations (audit log for brief / proposal AI)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.client_projects (id) on delete cascade,
  generation_type text not null
    check (generation_type in ('brief', 'proposal')),
  input_json jsonb,
  output_json jsonb,
  model text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists ai_generations_project_id_idx
  on public.ai_generations (project_id);

create index if not exists ai_generations_type_idx
  on public.ai_generations (generation_type);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.proposals enable row level security;
alter table public.proposal_sections enable row level security;
alter table public.proposal_feedback enable row level security;
alter table public.ai_generations enable row level security;

-- Anon: no direct table access. Public ops via RPC in Stage 3.2+.

drop policy if exists "Authenticated can manage proposals" on public.proposals;
create policy "Authenticated can manage proposals"
on public.proposals
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can manage proposal sections" on public.proposal_sections;
create policy "Authenticated can manage proposal sections"
on public.proposal_sections
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can manage proposal feedback" on public.proposal_feedback;
create policy "Authenticated can manage proposal feedback"
on public.proposal_feedback
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can manage ai generations" on public.ai_generations;
create policy "Authenticated can manage ai generations"
on public.ai_generations
for all
to authenticated
using (true)
with check (true);
