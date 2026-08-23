-- Add hero image for homepage (run in SQL Editor)

alter table public.site_settings
  add column if not exists hero_image text;
