-- OXANA PROJECTS — client CRM module (Stage 1)
-- Clients + client_projects. Does NOT touch portfolio tables.
-- Run in Supabase SQL Editor after schema.sql

create extension if not exists "pgcrypto";

-- Reuse updated_at helper if missing
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
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text,
  phone text,
  messenger text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists clients_name_idx on public.clients (name);
create index if not exists clients_email_idx on public.clients (email);
create index if not exists clients_created_at_idx on public.clients (created_at desc);

-- ---------------------------------------------------------------------------
-- client_projects
-- ---------------------------------------------------------------------------
create table if not exists public.client_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  title text not null,
  project_type text not null,
  description text,
  task text,
  notes text,
  budget text,
  deadline text,
  status text not null default 'Новый',
  brief_token text not null unique,
  proposal_token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_projects_client_id_idx
  on public.client_projects (client_id);

create index if not exists client_projects_status_idx
  on public.client_projects (status);

create index if not exists client_projects_project_type_idx
  on public.client_projects (project_type);

create index if not exists client_projects_created_at_idx
  on public.client_projects (created_at desc);

create index if not exists client_projects_brief_token_idx
  on public.client_projects (brief_token);

create index if not exists client_projects_proposal_token_idx
  on public.client_projects (proposal_token);

drop trigger if exists client_projects_set_updated_at on public.client_projects;
create trigger client_projects_set_updated_at
before update on public.client_projects
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.client_projects enable row level security;

-- Public (anon): no direct access to clients / client_projects in Stage 1.
-- Token-based public access will be added via RPC in later stages.

drop policy if exists "Authenticated can manage clients" on public.clients;
create policy "Authenticated can manage clients"
on public.clients
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can manage client projects" on public.client_projects;
create policy "Authenticated can manage client projects"
on public.client_projects
for all
to authenticated
using (true)
with check (true);
