-- Site settings (singleton row id = 'main')
-- Run in SQL Editor after schema.sql if needed

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
  description,
  email,
  phone,
  telegram,
  vk,
  github
)
values (
  'main',
  'OXANA PROJECTS',
  'Сайты, web-приложения и digital-проекты',
  'Сайты, web-приложения, автоматизации и digital-проекты с акцентом на ясность и премиальную подачу.',
  null,
  null,
  null,
  null,
  null
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
