import { readFileSync } from 'node:fs'
import dns from 'node:dns'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg

const SSL_URL_PARAMS = ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'] as const

let pool: pg.Pool | null = null

/** Directory that contains `package.json` and `certs/`, independent of process.cwd(). */
export const SERVER_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/**
 * Resolve PII_DB_CA_CERT_PATH / OXANA_DB_CA_CERT_PATH.
 * Supports `~` / `~/...` via os.homedir() and `%USERPROFILE%` via process.env.USERPROFILE.
 * Relative paths are resolved from the server package root, not process.cwd().
 * Never log the resolved path contents of the certificate.
 */
export function resolveCaCertPath(rawPath: string): string {
  let expanded = rawPath.trim()

  if (expanded.startsWith('~')) {
    const home = os.homedir()
    expanded =
      expanded === '~' || expanded.startsWith('~/') || expanded.startsWith('~\\')
        ? path.join(home, expanded.slice(2))
        : expanded
  }

  if (/%USERPROFILE%/i.test(expanded)) {
    const profile = process.env.USERPROFILE?.trim()
    if (!profile) {
      throw new Error('USERPROFILE is not available to expand PII_DB_CA_CERT_PATH')
    }
    expanded = expanded.replace(/%USERPROFILE%/gi, profile)
  }

  if (path.isAbsolute(expanded)) {
    return path.normalize(expanded)
  }
  return path.resolve(SERVER_ROOT, expanded)
}

function loadCaCertificate(): string {
  const caPathRaw = process.env.PII_DB_CA_CERT_PATH?.trim()
  if (!caPathRaw) {
    throw new Error(
      'PII_DB_CA_CERT_PATH is not configured (required for verified SSL)',
    )
  }

  const caPath = resolveCaCertPath(caPathRaw)

  try {
    // Certificate PEM only — never log contents or path with secrets.
    return readFileSync(caPath, 'utf8')
  } catch {
    throw new Error(
      'PII_DB_CA_CERT_PATH file is missing or unreadable (required for verified SSL)',
    )
  }
}

/**
 * Strip ssl* query params from the URL so node-postgres does not override
 * the explicit Pool `ssl` object (CA + rejectUnauthorized).
 * Never log the result — may still contain credentials.
 */
export function sanitizePiiDatabaseUrl(raw: string): string {
  const url = new URL(raw)
  for (const key of SSL_URL_PARAMS) {
    url.searchParams.delete(key)
  }
  return url.toString()
}

/** Force IPv4 DNS resolution for pg/net (avoid IPv6 blackhole timeouts). */
function lookupIpv4(
  hostname: string,
  _options: unknown,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
): void {
  dns.lookup(hostname, { family: 4 }, callback)
}

export function getPiiPool(): pg.Pool {
  if (pool) {
    return pool
  }

  const rawUrl = process.env.PII_DATABASE_URL?.trim()
  if (!rawUrl) {
    throw new Error('PII_DATABASE_URL is not configured')
  }

  let connectionString: string
  try {
    connectionString = sanitizePiiDatabaseUrl(rawUrl)
  } catch {
    throw new Error('PII_DATABASE_URL is invalid')
  }

  const ca = loadCaCertificate()

  // Never log the connection string or certificate contents.
  // SSL is configured ONLY via this object (not via URL sslmode*).
  // `lookup` is passed through to net.connect; not in PoolConfig typings.
  pool = new Pool({
    connectionString,
    ssl: {
      ca,
      rejectUnauthorized: true,
    },
    lookup: lookupIpv4,
    connectionTimeoutMillis: 10_000,
    max: 10,
  } as pg.PoolConfig)

  return pool
}

export async function closePiiPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
