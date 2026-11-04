/**
 * Migrate existing Supabase clients PII -> Russian Postgres (encrypted).
 *
 * Usage:
 *   npm run migrate:pii:dry
 *   npm run migrate:pii
 *
 * Never logs PII values. Does NOT scrub Supabase columns (separate manual step).
 */

import { randomUUID } from 'node:crypto'
import { encryptPii, decryptPii } from '../src/crypto/piiCrypto.js'
import { closePiiPool, getPiiPool } from '../src/db.js'
import { getSupabaseAdmin } from '../src/supabase.js'

type ClientRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  messenger: string | null
  pii_ref: string | null
}

/** Static INSERT text (no bound values). Placeholders: $1..$6 → 6 params. */
const CLIENT_PII_INSERT_SQL = `insert into public.client_pii (
           client_ref, full_name_enc, phone_enc, email_enc, messenger_enc,
           consent_given, consent_version, consent_at
         ) values ($1,$2,$3,$4,$5,false,$6,null)`

function isDryRun(): boolean {
  return process.argv.includes('--dry-run')
}

/**
 * Safe PG / Node error snapshot for diagnostics.
 * Never includes bound params, ciphertext, connection strings, or secrets.
 */
function safePgDiagnostics(error: unknown): {
  db_code: string | null
  constraint: string | null
  table: string | null
  column: string | null
  severity: string | null
  safe_message: string
  error_name: string | null
} {
  const err =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : null

  const rawMessage =
    err && typeof err.message === 'string'
      ? err.message
      : error instanceof Error
        ? error.message
        : 'unknown_error'

  const safe_message = rawMessage
    .replace(/postgresql:\/\/[^\s]+/gi, '[redacted_db_url]')
    .replace(/postgres:\/\/[^\s]+/gi, '[redacted_db_url]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted_email]')
    .replace(/\bv1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+\b/g, '[redacted_cipher]')
    .replace(/password\s*=\s*[^\s]+/gi, 'password=[redacted]')
    .slice(0, 300)

  return {
    db_code: typeof err?.code === 'string' ? err.code : null,
    constraint: typeof err?.constraint === 'string' ? err.constraint : null,
    table: typeof err?.table === 'string' ? err.table : null,
    column: typeof err?.column === 'string' ? err.column : null,
    severity: typeof err?.severity === 'string' ? err.severity : null,
    safe_message,
    error_name: error instanceof Error ? error.name : null,
  }
}

async function main() {
  const dryRun = isDryRun()
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, phone, messenger, pii_ref')
    .order('created_at', { ascending: true })

  if (error) {
    console.info(
      JSON.stringify({
        event: 'migrate_failed',
        code: 'supabase_read_failed',
      }),
    )
    process.exit(1)
  }

  const clients = (data ?? []) as ClientRow[]
  console.info(
    JSON.stringify({
      event: 'migrate_start',
      dry_run: dryRun,
      total: clients.length,
    }),
  )

  const pool = dryRun ? null : getPiiPool()
  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const client of clients) {
    if (client.pii_ref) {
      skipped += 1
      console.info(
        JSON.stringify({
          event: 'migrate_row',
          client_id: client.id,
          migrated: false,
          code: 'already_has_pii_ref',
        }),
      )
      continue
    }

    const hasPii = Boolean(
      client.name?.trim() ||
        client.email?.trim() ||
        client.phone?.trim() ||
        client.messenger?.trim(),
    )
    if (!hasPii) {
      skipped += 1
      console.info(
        JSON.stringify({
          event: 'migrate_row',
          client_id: client.id,
          migrated: false,
          code: 'no_pii',
        }),
      )
      continue
    }

    const clientRef = randomUUID()
    const encName = encryptPii(client.name)
    const encPhone = encryptPii(client.phone)
    const encEmail = encryptPii(client.email)
    const encMessenger = encryptPii(client.messenger)

    // Verify encrypt/decrypt roundtrip without logging values.
    try {
      if (encName && decryptPii(encName) !== String(client.name ?? '').trim()) {
        throw new Error('roundtrip_name')
      }
      if (encEmail && decryptPii(encEmail) !== String(client.email ?? '').trim()) {
        throw new Error('roundtrip_email')
      }
    } catch {
      failed += 1
      console.info(
        JSON.stringify({
          event: 'migrate_row',
          client_id: client.id,
          migrated: false,
          code: 'verify_failed',
        }),
      )
      continue
    }

    if (dryRun) {
      migrated += 1
      console.info(
        JSON.stringify({
          event: 'migrate_row',
          client_id: client.id,
          migrated: true,
          code: 'dry_run_ok',
        }),
      )
      continue
    }

    // Param map (values never logged):
    // $1 client_ref uuid string (randomUUID)
    // $2..$5 nullable text ciphertexts | null
    // literal false → consent_given
    // $6 consent_version text
    // literal null → consent_at
    const insertParams = [
      clientRef,
      encName,
      encPhone,
      encEmail,
      encMessenger,
      process.env.CONSENT_VERSION ?? 'migration-pd3',
    ]

    try {
      await pool!.query(CLIENT_PII_INSERT_SQL, insertParams)

      const { error: updateError } = await supabase
        .from('clients')
        .update({ pii_ref: clientRef })
        .eq('id', client.id)

      if (updateError) {
        failed += 1
        console.info(
          JSON.stringify({
            event: 'migrate_row',
            client_id: client.id,
            migrated: false,
            code: 'supabase_pii_ref_failed',
          }),
        )
        continue
      }

      migrated += 1
      console.info(
        JSON.stringify({
          event: 'migrate_row',
          client_id: client.id,
          migrated: true,
          code: 'ok',
        }),
      )
    } catch (error) {
      failed += 1
      console.info(
        JSON.stringify({
          event: 'migrate_row',
          client_id: client.id,
          migrated: false,
          code: 'insert_failed',
          sql: CLIENT_PII_INSERT_SQL.replace(/\s+/g, ' ').trim(),
          placeholder_count: 6,
          param_count: insertParams.length,
          param_kinds: [
            'uuid_string',
            'text_or_null',
            'text_or_null',
            'text_or_null',
            'text_or_null',
            'text',
          ],
          on_conflict: null,
          returning: null,
          transaction: 'none_per_row_autocommit',
          ...safePgDiagnostics(error),
        }),
      )
    }
  }

  console.info(
    JSON.stringify({
      event: 'migrate_done',
      dry_run: dryRun,
      migrated,
      skipped,
      failed,
    }),
  )

  await closePiiPool()
}

main().catch(() => {
  console.info(JSON.stringify({ event: 'migrate_failed', code: 'unhandled' }))
  process.exit(1)
})
