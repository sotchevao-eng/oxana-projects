import { readFileSync } from 'node:fs'
import dns from 'node:dns'
import net from 'node:net'
import tls from 'node:tls'
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

function isPrivateIpv4(address: string): boolean {
  if (!net.isIPv4(address)) {
    return false
  }
  const [first, second] = address.split('.').map((part) => Number(part))
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
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

export function parseOxanaConnectHost(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) {
    return undefined
  }
  if (!isPrivateIpv4(value)) {
    throw new OxanaDbUnavailableError()
  }
  return value
}

export interface OxanaSocketTarget {
  tcpHost: string
  connectionString: string
  tlsServername: string | null
  useSsl: boolean
}

/**
 * pg 8.x connects TCP to `host` and sets TLS servername only when host is not
 * an IP. Pin TCP with OXANA_DB_CONNECT_HOST (private IPv4) and keep the URL
 * hostname as ssl.servername so the certificate is checked against the FQDN.
 */
export function resolveOxanaSocketTarget(
  inspected: { hostname: string; connectionString: string },
  connectHost: string | undefined,
  sslDisableHostname = inspected.hostname,
): OxanaSocketTarget {
  if (connectHost) {
    if (net.isIP(inspected.hostname) !== 0) {
      throw new OxanaDbUnavailableError()
    }
    if (shouldDisableOxanaSsl(sslDisableHostname)) {
      throw new OxanaDbUnavailableError()
    }
    const tcpUrl = new URL(inspected.connectionString)
    tcpUrl.hostname = connectHost
    return {
      tcpHost: connectHost,
      connectionString: tcpUrl.toString(),
      tlsServername: inspected.hostname,
      useSsl: true,
    }
  }

  const disableSsl = shouldDisableOxanaSsl(inspected.hostname)
  return {
    tcpHost: inspected.hostname,
    connectionString: inspected.connectionString,
    tlsServername: disableSsl || net.isIP(inspected.hostname) !== 0 ? null : inspected.hostname,
    useSsl: !disableSsl,
  }
}

export function createOxanaCheckServerIdentity(tlsServername: string) {
  if (!tlsServername || net.isIP(tlsServername) !== 0) {
    throw new OxanaDbUnavailableError()
  }
  return (_hostname: string, cert: tls.PeerCertificate) =>
    tls.checkServerIdentity(tlsServername, cert)
}

export function buildOxanaTlsOptions(
  tlsServername: string,
  ca: string,
): {
  ca: string
  rejectUnauthorized: true
  servername: string
  host: string
  checkServerIdentity: ReturnType<typeof createOxanaCheckServerIdentity>
} {
  if (!tlsServername || net.isIP(tlsServername) !== 0 || !ca.includes('BEGIN CERTIFICATE')) {
    throw new OxanaDbUnavailableError()
  }
  return {
    ca,
    rejectUnauthorized: true,
    servername: tlsServername,
    // Node uses host for identity when TLS wraps an already-connected socket.
    host: tlsServername,
    checkServerIdentity: createOxanaCheckServerIdentity(tlsServername),
  }
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
  let connectHost: string | undefined
  try {
    inspected = inspectOxanaDatabaseUrl(rawUrl)
    connectHost = parseOxanaConnectHost(process.env.OXANA_DB_CONNECT_HOST)
  } catch {
    throw new OxanaDbUnavailableError()
  }

  let target: OxanaSocketTarget
  try {
    target = resolveOxanaSocketTarget(inspected, connectHost)
  } catch {
    throw new OxanaDbUnavailableError()
  }

  const ssl = target.useSsl
    ? buildOxanaTlsOptions(target.tlsServername ?? '', loadCaCertificate())
    : false

  pool = new Pool({
    connectionString: target.connectionString,
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
