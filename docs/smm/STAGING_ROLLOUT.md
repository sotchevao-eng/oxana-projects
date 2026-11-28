# SMM 0.3 — staging / rollout checklist

Verified CI: run 46052224241, commit 63d34d0208188ef04836e3542ab3f559754aa3d8. Both checks and PostgreSQL 18 jobs passed. This is not a production acceptance test.

## Before touching Timeweb
- Inspect current frontend/backend deployment branches, revision, region, Node version, CPU/RAM and database backup availability. Do not change main or deploy production from this branch.
- Confirm a separate staging environment in Russia and its cost before provisioning. If no existing staging is available, stop and obtain owner approval. Use synthetic data only until Russian authentication is implemented/approved.
- Keep staging frontend/backend isolated from production DB, PII, auth credentials and reminder jobs. Use separate test auth identity, secrets and database; never copy production secrets to GitHub. No public PostgreSQL port. Restrict staging access.
- Backend path server, npm ci, npm start, Node 24 (CI tested), health /api/health. Frontend npm ci / npm run build; VITE_OXANA_API_URL points exclusively to staging backend. CORS_ORIGINS restricted to staging origin. OXANA_REMINDERS=disable.
- Keep OXANA_SMM_ENABLED=false initially. No VK/MAX/AI credentials or paid services.

## Database
- Confirm target database and migration account in Russian PostgreSQL. Back up first. Apply russian-postgres/smm-001.sql once, only in staging. Do not apply to Supabase.
- Confirm actual runtime role from the configured OXANA_DATABASE_URL privately (no password output). It must not be a database/schema owner or superuser. Grant USAGE on smm; SELECT/INSERT on communities, posts, post_versions, approvals, audit_logs as needed; UPDATE only on communities and posts; sequence privileges only if required for audit identity. No DELETE or DDL. Verify with runtime role before enabling. Budget table is unused; no grants required yet.
- Existing shared pool uses oxana search_path, but SMM queries are schema-qualified. Do not change existing oxana schema or pool settings for SMM.
- Integration CI uses disposable DB owner, so minimal runtime grants are NOT yet verified. Treat this as a staging gate.

## Smoke test
- Verify baseline existing OXANA health, then enable OXANA_SMM_ENABLED=true only on staging.
- Log in as authorized test user; create synthetic community, edit policy, create draft, approve v1, edit to v2 and verify approval reset. Attempt stale approval (409), unauthorized access (401/403), cross-owner access (404), publish (403).
- Refresh browser; verify persistence and errors. Check sanitized logs and regression tests. Do not use real communities until owner authorizes private staging and data policy.
- Record actual deployment revision and evidence. Only after owner approval consider production rollout; do not merge automatically.

## Rollback
Disable OXANA_SMM_ENABLED first; revert staging frontend/backend to known revisions if necessary. Preserve SMM tables for diagnosis; no automatic DROP or data loss. Production rollback and migrations require separate owner approval.

## Remaining limitations
No publication, image handling, monitoring, paid generation, or budget enforcement. Authentication is still Supabase; no commercial launch. Live Timeweb environment not inspected; no staging deployment performed by this document.
