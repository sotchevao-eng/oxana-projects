# AI brief generation (Edge Function)

## Secrets (Supabase Dashboard → Edge Functions → Secrets)

- `OPENAI_API_KEY` — required
- `OPENAI_MODEL` — optional, default `gpt-4.1-mini`

Do NOT put AI keys in frontend `.env`.

## Deploy

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
supabase functions deploy generate-brief
```

## Test

1. Open admin → client project → tab «Бриф»
2. Click «Сгенерировать бриф с ИИ»
3. Fill context → Generate
4. Edit/remove preview questions
5. «Добавить к текущему» or «Заменить текущий»
6. Confirm questions appear in brief_fields / public brief URL
