import { readFileSync } from 'node:fs'
import dns from 'node:dns'
import pg from 'pg'
import { resolveCaCertPath } from '../db.js'
import { OxanaDbUnavailableError } from './errors.js'

const { Pool } = pg
const SSL_URL_PARAMS = ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'] as const

let pool: pg.Pool | null = null

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

function sanitizeDatabaseUrl(raw: string): string {
  const url = new URL(raw)
  for (const key of SSL_URL_PARAMS) {
    url.searchParams.delete(key)
  }
  return url.toString()
}

export function inspectOxanaDatabaseUrl(raw: string): {
  hostname: string
  connectionString: string
} {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new OxanaDbUnavailableError()
  }

  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname.includes('supabase.co') ||
    hostname.includes('supabase.com') ||
    hostname.includes('pooler.supabase')
  ) {
    throw new OxanaDbUnavailableError()
  }

  return {
    hostname,
    connectionString: sanitizeDatabaseUrl(raw),
  }
}

export function shouldDisableOxanaSsl(hostname: string): boolean {
  const flag = process.env.OXANA_DB_SSL?.trim().toLowerCase() === 'disable'
  if (!flag) {
    return false
  }
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function loadCaCertificate(): string {
  const inline = process.env.OXANA_DB_CA_CERT?.trim()
  if (inline && inline.includes('BEGIN CERTIFICATE')) {
    return inline
  }
  const caPathRaw =
    process.env.OXANA_DB_CA_CERT_PATH?.trim() ||
    process.env.PII_DB_CA_CERT_PATH?.trim()
  if (!caPathRaw) {
    throw new OxanaDbUnavailableError()
  }
  try {
    return readFileSync(resolveCaCertPath(caPathRaw), 'utf8')
  } catch {
    throw new OxanaDbUnavailableError()
  }
}

export function isOxanaDatabaseConfigured(): boolean {
  return Boolean(process.env.OXANA_DATABASE_URL?.trim())
}

export function getOxanaPool(): pg.Pool {
  if (pool) {
    return pool
  }

  const rawUrl = process.env.OXANA_DATABASE_URL?.trim()
  if (!rawUrl) {
    throw new OxanaDbUnavailableError()
  }

  let inspected: { hostname: string; connectionString: string }
  try {
    inspected = inspectOxanaDatabaseUrl(rawUrl)
  } catch {
    throw new OxanaDbUnavailableError()
  }

  const disableSsl = shouldDisableOxanaSsl(inspected.hostname)
  const ssl = disableSsl
    ? false
    : {
        ca: loadCaCertificate(),
        rejectUnauthorized: true,
      }

  pool = new Pool({
    connectionString: inspected.connectionString,
    ssl,
    lookup: lookupIpv4,
    connectionTimeoutMillis: 10_000,
    max: 10,
    application_name: 'oxana-ai',
    options: '-c search_path=oxana,pg_catalog',
  } as pg.PoolConfig)

  return pool
}

export async function closeOxanaPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export function resetOxanaPoolForTests(): void {
  pool = null
}
