# OXANA PROJECTS

Персональное web-приложение-портфолио для демонстрации сайтов, web-приложений, автоматизаций и digital-проектов.

## Стек

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Lucide Icons
- Supabase

## Запуск

```bash
npm install
npm run dev
```

## Supabase

1. Создайте проект в Supabase.
2. Скопируйте `.env.example` → `.env` и заполните:

```env
VITE_SUPABASE_URL=https://XXXX.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Ключи: **Project Settings → API**  
- URL без `/rest/v1/`  
- для `ANON_KEY` лучше **Legacy API keys → anon** (длинный ключ `eyJ...`).  
  Ключ вида `sb_publishable_...` тоже можно попробовать, если вход не работает — замените на `eyJ...`.

3. В SQL Editor выполните **один** файл:
   - `supabase/setup-all.sql` (схема + демо-проекты + storage)
   - `supabase/site-hero-image.sql` (поле картинки на главной, если база уже создана)

   Или по частям:
   - `supabase/schema.sql`
   - `supabase/seed.sql`
   - `supabase/storage.sql`

Пока `.env` пустой или недоступен, приложение использует локальные данные и не ломает интерфейс.

## Админка

Маршруты:
- `/admin/login` — вход через Supabase Auth (ссылка «Вход» в футере)
- `/admin` — защищённая зона
- `/admin/settings` — контакты и тексты сайта
- `/admin/projects` — проекты

Создайте пользователя: Supabase → **Authentication → Users → Add user**.

После входа заполните **Настройки**: email / Telegram — иначе контакты на сайте скрыты.

## Структура

```
src/
  components/
  pages/
  layouts/
  data/
  types/
  hooks/
  services/
  assets/
supabase/
  schema.sql
  seed.sql
  settings.sql
  storage.sql
  project-case-fields.sql
```
