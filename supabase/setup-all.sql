-- OXANA PROJECTS — полный первичный setup
-- Скопируйте ВЕСЬ файл в Supabase → SQL Editor → Run

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


-- ===== SEED =====

-- Seed data for OXANA PROJECTS
-- Run after schema.sql

insert into public.projects (
  id,
  title,
  slug,
  short_description,
  description,
  category,
  subcategory,
  status,
  year,
  event_date,
  cover_image,
  card_image,
  demo_url,
  website_url,
  github_url,
  technologies,
  tags,
  featured,
  sort_order,
  created_at,
  updated_at,
  published_at
) values
(
  '11111111-1111-1111-1111-111111111111',
  'Свадебное приглашение — Сергей & Ольга',
  'sergey-olga-wedding',
  'Персональный сайт-приглашение с программой, местом проведения и подтверждением присутствия.',
  'Персональный сайт-приглашение на свадьбу с программой мероприятия, информацией о месте проведения и подтверждением присутствия.',
  'Сайт',
  'Wedding',
  'published',
  2026,
  '2026-09-09',
  null,
  null,
  null,
  null,
  null,
  array['React', 'TypeScript', 'Tailwind CSS'],
  array['Свадьба', 'Приглашение', 'RSVP'],
  true,
  1,
  '2026-01-15T10:00:00.000Z',
  '2026-03-01T12:00:00.000Z',
  '2026-03-01T12:00:00.000Z'
),
(
  '22222222-2222-2222-2222-222222222222',
  'ТСЖ «Васильевский»',
  'tsj-vasilevsky',
  'Информационный сайт для жителей дома: новости, документы, тарифы и контакты.',
  'Информационный сайт для жителей дома: новости, документы, тарифы, контакты и аварийная информация.',
  'Сайт',
  'ЖКХ',
  'published',
  2025,
  null,
  null,
  null,
  null,
  null,
  null,
  array['React', 'TypeScript', 'Vite'],
  array['ЖКХ', 'ТСЖ', 'Информационный сайт'],
  true,
  2,
  '2025-06-10T10:00:00.000Z',
  '2025-11-20T12:00:00.000Z',
  '2025-11-20T12:00:00.000Z'
),
(
  '33333333-3333-3333-3333-333333333333',
  'БухКонтроль',
  'buhkontrol',
  'Система контроля организаций, налоговых сроков, задач и отчётности.',
  'Система контроля организаций, налоговых сроков, задач, отчётности и документов.',
  'Web-приложение',
  'Бухгалтерия',
  'published',
  2025,
  null,
  null,
  null,
  null,
  null,
  null,
  array['React', 'TypeScript', 'Vite'],
  array['Бухгалтерия', 'Сроки', 'Документы'],
  true,
  3,
  '2025-03-01T10:00:00.000Z',
  '2025-12-15T12:00:00.000Z',
  '2025-12-15T12:00:00.000Z'
),
(
  '44444444-4444-4444-4444-444444444444',
  'ЮрКонтур',
  'yurkontur',
  'Рабочая система для юридических задач, документов, сроков и контроля дел.',
  'Рабочая система для юридических задач, документов, сроков и контроля дел.',
  'Web-приложение',
  'Юридические услуги',
  'published',
  2025,
  null,
  null,
  null,
  null,
  null,
  null,
  array['React', 'TypeScript'],
  array['Юриспруденция', 'Документы', 'Сроки'],
  false,
  4,
  '2025-02-12T10:00:00.000Z',
  '2025-09-01T12:00:00.000Z',
  '2025-09-01T12:00:00.000Z'
),
(
  '55555555-5555-5555-5555-555555555555',
  'Старый город',
  'staryj-gorod',
  'Корпоративный сайт компании по аренде и продаже башенных кранов.',
  'Корпоративный проект компании по аренде и продаже башенных кранов.',
  'Сайт',
  'Строительство',
  'published',
  2024,
  null,
  null,
  null,
  null,
  null,
  null,
  array['React', 'Tailwind CSS'],
  array['Строительство', 'Корпоративный сайт'],
  false,
  5,
  '2024-08-20T10:00:00.000Z',
  '2024-12-05T12:00:00.000Z',
  '2024-12-05T12:00:00.000Z'
),
(
  '66666666-6666-6666-6666-666666666666',
  'Калькулятор поступлений',
  'kalkulyator-postupleniy',
  'Приложение для расчёта начислений, оплат, задолженности и отчётности.',
  'Приложение для расчёта начислений, оплат, задолженности и формирования отчётности.',
  'Web-приложение',
  'Финансы',
  'published',
  2024,
  null,
  null,
  null,
  null,
  null,
  null,
  array['React', 'TypeScript'],
  array['Финансы', 'Расчёты', 'Отчётность'],
  false,
  6,
  '2024-05-14T10:00:00.000Z',
  '2024-10-22T12:00:00.000Z',
  '2024-10-22T12:00:00.000Z'
)
on conflict (slug) do nothing;

insert into public.project_images (project_id, image_url, alt, sort_order)
values
  ('11111111-1111-1111-1111-111111111111', '/gallery/frame-1.svg', 'Свадебное приглашение — кадр 1', 1),
  ('11111111-1111-1111-1111-111111111111', '/gallery/frame-2.svg', 'Свадебное приглашение — кадр 2', 2),
  ('11111111-1111-1111-1111-111111111111', '/gallery/frame-3.svg', 'Свадебное приглашение — кадр 3', 3),
  ('11111111-1111-1111-1111-111111111111', '/gallery/frame-4.svg', 'Свадебное приглашение — кадр 4', 4),
  ('33333333-3333-3333-3333-333333333333', '/gallery/frame-2.svg', 'БухКонтроль — кадр 1', 1),
  ('33333333-3333-3333-3333-333333333333', '/gallery/frame-3.svg', 'БухКонтроль — кадр 2', 2),
  ('33333333-3333-3333-3333-333333333333', '/gallery/frame-1.svg', 'БухКонтроль — кадр 3', 3);


-- ===== STORAGE =====

-- Supabase Storage bucket for project images
-- Run in SQL Editor after schema.sql

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read project images bucket" on storage.objects;
create policy "Public can read project images bucket"
on storage.objects
for select
to public
using (bucket_id = 'project-images');

drop policy if exists "Authenticated can upload project images" on storage.objects;
create policy "Authenticated can upload project images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'project-images');

drop policy if exists "Authenticated can update project images" on storage.objects;
create policy "Authenticated can update project images"
on storage.objects
for update
to authenticated
using (bucket_id = 'project-images')
with check (bucket_id = 'project-images');

drop policy if exists "Authenticated can delete project images" on storage.objects;
create policy "Authenticated can delete project images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'project-images');
