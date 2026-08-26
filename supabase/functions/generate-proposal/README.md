# AI commercial proposal generation (Edge Function)

## Secrets (Supabase Dashboard → Edge Functions → Secrets)

- `OPENAI_API_KEY` — required (same secret as generate-brief)
- `OPENAI_MODEL` — optional, default `gpt-4.1-mini`

Do NOT put AI keys in frontend `.env`.

## Deploy

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
supabase functions deploy generate-proposal
```

## Test

1. Admin → client project → tab «КП»
2. Click «Сгенерировать КП с ИИ»
3. Fill price / deadline / comment / style → Generate
4. Edit preview sections
5. «Использовать этот вариант»
6. Confirm proposal stays unpublished (`published = false`, status draft/ready)
