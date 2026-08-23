-- Extra RLS for admin dashboard (run if schema was applied earlier)

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
