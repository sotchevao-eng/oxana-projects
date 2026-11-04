# OXANA PII API (PD.3)

Server-side API for encrypted personal data in Russian PostgreSQL (Timeweb Moscow).

## Never

- Put `PII_DATABASE_URL` / `PII_ENCRYPTION_KEY` in `VITE_*` or frontend
- Commit `.env`
- Log connection strings or plaintext PII
- Connect the browser directly to Postgres
- Decrypt PII inside Supabase Edge (Seoul) — substitute placeholders only in RF backend/admin

## Setup

1. Apply `../russian-postgres/client_pii.sql` on the Moscow DB (manual).
2. Apply `../supabase/pii-ref-migration.sql` in Supabase SQL Editor (manual).
3. Copy `.env.example` → `.env` and fill secrets.
4. Prefer private DB host `192.168.0.7` when the API runs inside Timeweb network.
5. Install & run:

```bash
cd server
npm install
npm run dev
```

Health: `GET http://localhost:8787/api/health`

## OXANA AI (RF module)

New schema: `../russian-postgres/oxana-ai.sql` — apply manually on Timeweb Postgres in MSK/SPB only. Do not apply to Supabase.

Required server env:

- `OXANA_DATABASE_URL` — Russian Postgres URL (schema `oxana`)
- `OXANA_ALLOWED_USER_IDS` — comma-separated Supabase user ids; empty = deny all
- `OXANA_DB_CA_CERT_PATH` or existing `PII_DB_CA_CERT_PATH` for verified SSL
- `CORS_ORIGINS` must include the site origin

Frontend: `VITE_OXANA_API_URL` (no secrets).

Token check is isolated in `src/oxana/tokenVerifier.ts`. Task/chat routes only see `userId`. Later set `OXANA_AUTH_PROVIDER=russian` after a Russian verifier is added.

Local isolated DB (not Timeweb, not production):

```bash
docker compose -f docker-compose.oxana-test.yml up -d
# PowerShell
$env:OXANA_TEST_DATABASE_URL="postgresql://oxana:oxana_test@127.0.0.1:55432/oxana_ai_test"
npm run test:oxana-db
```

The script refuses supabase/timeweb hosts.

Working now: JWT + allowlist, tasks CRUD-lite, projects list/create, empty events/notifications from DB. Chat contract returns `ai_not_configured`. Telegram/MAX/GigaChat live calls are not connected.

## Endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/api/health` | public |
| POST | `/api/pii` | admin JWT |
| GET | `/api/pii/:ref` | admin JWT |
| PATCH | `/api/pii/:ref` | admin JWT |
| POST | `/api/public/brief-pii` | `brief_token` + rate limit |
| GET | `/api/oxana/status` | JWT + allowlist |
| GET/POST | `/api/oxana/tasks` | JWT + allowlist |
| PATCH | `/api/oxana/tasks/:id` | JWT + allowlist |
| GET/POST | `/api/oxana/projects` | JWT + allowlist |
| GET | `/api/oxana/events` | JWT + allowlist |
| GET | `/api/oxana/notifications` | JWT + allowlist |
| POST | `/api/oxana/chat` | JWT + allowlist; returns `ai_not_configured` |

## Migration

```bash
npm run migrate:pii:dry
npm run migrate:pii
```

Scrub of Supabase `clients.name/email/phone/messenger` is a **separate manual step**  
(`../supabase/pii-scrub-after-cutover.sql`) after verification.

## Local smoke test

1. Fill `.env` (DB URL + encryption key + Supabase service role).
2. Apply Russian SQL, then Supabase `pii_ref` SQL.
3. `npm run dev` → health OK.
4. Admin JWT from browser session → `POST /api/pii` with consent + sample fields.
5. `GET /api/pii/:ref` → decrypted values match (do not paste into logs/chat).
6. `npm run migrate:pii:dry` → counts only, no writes.

## Deploy

This folder is a separate Timeweb App Platform **Backend** app (Moscow), not the existing Frontend site.

- Path: `server`
- Node.js 20+
- Install: `npm ci`
- Start: `npm start` (reads panel env, not `.env`)
- Health: `GET /api/health`
- Bind: `0.0.0.0` and `PORT`
- Do not upload `.env`, certificates from git, or `VITE_*` secrets
- Reminders start in this process unless `OXANA_REMINDERS=disable`

See `.env.example` for variable names only. Do not open PostgreSQL `:5432` to the internet.
