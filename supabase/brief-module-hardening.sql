-- OXANA PROJECTS — optional Stage 2 hardening (run ONLY after brief-module.sql)
-- Do not apply automatically. Safe to skip if you already have a clean DB.

-- At most one draft submission per client project
create unique index if not exists brief_submissions_one_draft_per_project
  on public.brief_submissions (project_id)
  where status = 'draft';

-- Re-assert public execute grants (idempotent)
grant execute on function public.get_public_brief(text) to anon, authenticated;
grant execute on function public.save_public_brief_draft(text, jsonb) to anon, authenticated;
grant execute on function public.submit_public_brief(text, jsonb) to anon, authenticated;
