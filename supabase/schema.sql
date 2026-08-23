-- OXANA PROJECTS — schema for Supabase
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  short_description text not null,
  description text not null,
  task text,
  solution text,
  result text,
  category text not null,
  subcategory text not null default '',
  status text not null default 'published'
    check (status in ('published', 'draft', 'archived')),
  year integer not null,
  event_date date,
  cover_image text,
  card_image text,
  demo_url text,
  website_url text,
  github_url text,
  technologies text[] not null default '{}',
  tags text[] not null default '{}',
  featured boolean not null default false,
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  image_url text not null,
  alt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_images_project_id_idx
  on public.project_images (project_id);

create index if not exists project_images_sort_order_idx
  on public.project_images (project_id, sort_order);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text,
  phone text,
  project_type text,
  message text not null,
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'done', 'archived')),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.project_images enable row level security;
alter table public.contacts enable row level security;

drop policy if exists "Public can read published projects" on public.projects;
create policy "Public can read published projects"
on public.projects
for select
to anon, authenticated
using (status = 'published');

drop policy if exists "Public can read project images" on public.project_images;
create policy "Public can read project images"
on public.project_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_images.project_id
      and p.status = 'published'
  )
);

drop policy if exists "Public can create contacts" on public.contacts;
create policy "Public can create contacts"
on public.contacts
for insert
to anon, authenticated
with check (true);

drop policy if exists "Authenticated can read all projects" on public.projects;
create policy "Authenticated can read all projects"
on public.projects
for select
to authenticated
using (true);

drop policy if exists "Authenticated can read all project images" on public.project_images;
create policy "Authenticated can read all project images"
on public.project_images
for select
to authenticated
using (true);

drop policy if exists "Authenticated can read contacts" on public.contacts;
create policy "Authenticated can read contacts"
on public.contacts
for select
to authenticated
using (true);

drop policy if exists "Authenticated can update contacts" on public.contacts;
create policy "Authenticated can update contacts"
on public.contacts
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can insert projects" on public.projects;
create policy "Authenticated can insert projects"
on public.projects
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update projects" on public.projects;
create policy "Authenticated can update projects"
on public.projects
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete projects" on public.projects;
create policy "Authenticated can delete projects"
on public.projects
for delete
to authenticated
using (true);

drop policy if exists "Authenticated can insert project images" on public.project_images;
create policy "Authenticated can insert project images"
on public.project_images
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update project images" on public.project_images;
create policy "Authenticated can update project images"
on public.project_images
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete project images" on public.project_images;
create policy "Authenticated can delete project images"
on public.project_images
for delete
to authenticated
using (true);

-- Site settings (singleton)
create table if not exists public.site_settings (
  id text primary key default 'main' check (id = 'main'),
  site_name text not null default 'OXANA PROJECTS',
  subtitle text,
  description text,
  email text,
  phone text,
  telegram text,
  vk text,
  github text,
  hero_image text,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (
  id,
  site_name,
  subtitle,
  description
)
values (
  'main',
  'OXANA PROJECTS',
  'Сайты, web-приложения и digital-проекты',
  'Сайты, web-приложения, автоматизации и digital-проекты с акцентом на ясность и премиальную подачу.'
)
on conflict (id) do nothing;

create or replace function public.set_site_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
before update on public.site_settings
for each row
execute function public.set_site_settings_updated_at();

alter table public.site_settings enable row level security;

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
on public.site_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated can upsert site settings" on public.site_settings;
create policy "Authenticated can upsert site settings"
on public.site_settings
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update site settings" on public.site_settings;
create policy "Authenticated can update site settings"
on public.site_settings
for update
to authenticated
using (true)
with check (true);
