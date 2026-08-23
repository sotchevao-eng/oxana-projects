-- Add SEO fields and write policies for admin project CRUD

alter table public.projects
  add column if not exists seo_title text;

alter table public.projects
  add column if not exists seo_description text;

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
