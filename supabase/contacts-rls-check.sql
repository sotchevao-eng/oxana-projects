-- Проверка / ужесточение RLS для contacts (опционально, если схема уже применена)
-- Публично: только INSERT. Чтение и обновление — только authenticated.

alter table public.contacts enable row level security;

drop policy if exists "Public can create contacts" on public.contacts;
create policy "Public can create contacts"
on public.contacts
for insert
to anon, authenticated
with check (true);

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

-- Явно запрещаем публичное чтение/удаление (нет policy = deny при RLS)
drop policy if exists "Public can read contacts" on public.contacts;
drop policy if exists "Public can delete contacts" on public.contacts;
drop policy if exists "Authenticated can delete contacts" on public.contacts;
