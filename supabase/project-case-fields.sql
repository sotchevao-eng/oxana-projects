-- Case study fields for projects (run in SQL Editor)

alter table public.projects
  add column if not exists task text;

alter table public.projects
  add column if not exists solution text;

alter table public.projects
  add column if not exists result text;
