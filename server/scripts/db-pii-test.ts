/**
 * Safe PostgreSQL connectivity smoke test (SELECT 1 only).
 * Does not read/write client_pii, does not migrate, never logs secrets/PII.
 *
 * Usage: npm run db:pii:test
 */

import { closePiiPool, getPiiPool } from '../src/db.js'

function safeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'unknown_error'

  return raw
    .replace(/postgresql:\/\/[^\s]+/gi, '[redacted_db_url]')
    .replace(/postgres:\/\/[^\s]+/gi, '[redacted_db_url]')
    .replace(/password\s*=\s*[^\s]+/gi, 'password=[redacted]')
    .slice(0, 300)
}

async function main() {
  try {
    const pool = getPiiPool()
    const result = await pool.query<{ ok: number }>('select 1 as ok')
    if (result.rows[0]?.ok !== 1) {
      console.info(
        JSON.stringify({
          ok: false,
          code: 'unexpected_result',
          message: 'SELECT 1 did not return ok=1',
          error_name: null,
        }),
      )
      process.exitCode = 1
      return
    }
    console.info('PII_DB_CONNECTION_OK')
  } catch (error) {
    const err = error as { code?: unknown; name?: unknown }
    console.info(
      JSON.stringify({
        ok: false,
        code: typeof err.code === 'string' ? err.code : null,
        message: safeErrorMessage(error),
        error_name: error instanceof Error ? error.name : null,
      }),
    )
    process.exitCode = 1
  } finally {
    await closePiiPool()
  }
}

void main()
