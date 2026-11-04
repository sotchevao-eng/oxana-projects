import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

/**
 * Isolated OXANA schema smoke test.
 * Refuses remote/production hosts. Does not touch public PII tables.
 *
 *   docker compose -f server/docker-compose.oxana-test.yml up -d
 *   set OXANA_TEST_DATABASE_URL=postgresql://oxana:oxana_test@127.0.0.1:55432/oxana_ai_test
 *   npm run test:oxana-db
 */

const FORBIDDEN_HOST_MARKERS = [
  'supabase.co',
  'supabase.com',
  'twc1.net',
  'timeweb',
  'amazonaws.com',
]

function assertLocalTestUrl(raw: string): URL {
  const url = new URL(raw)
  const host = url.hostname.toLowerCase()
  if (FORBIDDEN_HOST_MARKERS.some((marker) => host.includes(marker))) {
    throw new Error('Refusing OXANA_TEST_DATABASE_URL: remote/production host')
  }
  const local = host === 'localhost' || host === '127.0.0.1'
  const named = url.pathname.includes('oxana_ai_test')
  if (!local && !named) {
    throw new Error(
      'OXANA_TEST_DATABASE_URL must be localhost or a database named oxana_ai_test',
    )
  }
  return url
}

async function main() {
  const raw = process.env.OXANA_TEST_DATABASE_URL?.trim()
  if (!raw) {
    throw new Error('OXANA_TEST_DATABASE_URL is required for the local DB scenario')
  }

  const parsed = assertLocalTestUrl(raw)
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sqlPath = path.resolve(here, '../../russian-postgres/oxana-ai.sql')
  const sql = readFileSync(sqlPath, 'utf8')

  const client = new pg.Client({
    connectionString: parsed.toString(),
    ssl: false,
  })
  await client.connect()
  try {
    await client.query(sql)
    const schema = await client.query(
      `select nspname from pg_namespace where nspname = 'oxana'`,
    )
    if (!schema.rows[0]) {
      throw new Error('schema oxana was not created')
    }
    const piiLeak = await client.query(
      `select 1
       from information_schema.tables
       where table_schema = 'oxana'
         and table_name in ('client_pii', 'brief_pii_answers')`,
    )
    if (piiLeak.rowCount) {
      throw new Error('oxana schema must not contain PII tables')
    }
    const tables = await client.query(
      `select table_name
       from information_schema.tables
       where table_schema = 'oxana'
       order by table_name`,
    )
    console.info(
      JSON.stringify({
        ok: true,
        event: 'oxana_local_db_ready',
        host: parsed.hostname,
        tables: tables.rows.map((row) => row.table_name),
      }),
    )
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      event: 'oxana_local_db_failed',
      error: error instanceof Error ? error.message : 'unknown',
    }),
  )
  process.exit(1)
})
