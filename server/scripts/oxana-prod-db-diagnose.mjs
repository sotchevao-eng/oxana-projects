/**
 * Paste this file onto the Timeweb Backend host (not into Git deploy) and run:
 *   node --input-type=module /tmp/oxana-prod-db-diagnose.mjs
 * from the application root. Read-only. No secrets, PEMs, URLs, or PII rows.
 */
import dns from 'node:dns'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import tls from 'node:tls'
import pg from 'pg'

const EXPECTED_PRIVATE_IP = '192.168.0.7'
const TIMEOUT_MS = 10_000
const PG_SSL_REQUEST = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f])
const SSL_URL_PARAMS = ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']

function log(payload) {
  console.info(JSON.stringify(payload))
}

function fail(code, extra = {}) {
  log({ ok: false, code, ...extra })
  process.exitCode = 1
}

function isRfc1918(address) {
  const parts = address.split('.').map((item) => Number(item))
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item))) return false
  const [a, b] = parts
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function loadCa() {
  const inline = process.env.OXANA_DB_CA_CERT?.replace(/\\n/g, '\n').trim()
  if (inline && inline.includes('BEGIN CERTIFICATE')) return inline
  const raw =
    process.env.OXANA_DB_CA_CERT_PATH?.trim() || process.env.PII_DB_CA_CERT_PATH?.trim()
  if (!raw) throw new Error('ca_missing')
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
  return fs.readFileSync(resolved, 'utf8')
}

function inspectUrl(raw) {
  const url = new URL(raw)
  for (const key of SSL_URL_PARAMS) url.searchParams.delete(key)
  const hostname = url.hostname.toLowerCase()
  if (
    hostname.includes('supabase.co') ||
    hostname.includes('supabase.com') ||
    hostname.includes('pooler.supabase')
  ) {
    throw new Error('supabase_host_forbidden')
  }
  return {
    hostname,
    port: url.port ? Number(url.port) : 5432,
    connectionString: url.toString(),
  }
}

function lookupIpv4(hostname, _options, callback) {
  dns.lookup(hostname, { family: 4 }, callback)
}

function connectTcp(hostname, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: hostname, port, family: 4 })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(Object.assign(new Error('tcp_timeout'), { code: 'ETIMEDOUT' }))
    }, TIMEOUT_MS)
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
  })
}

function probeTls(socket, hostname, ca) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(Object.assign(new Error('tls_timeout'), { code: 'ETIMEDOUT' }))
    }, TIMEOUT_MS)
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.write(PG_SSL_REQUEST)
    socket.once('data', (chunk) => {
      if (chunk.toString('utf8', 0, 1) !== 'S') {
        clearTimeout(timer)
        socket.destroy()
        reject(Object.assign(new Error('ssl_refused'), { code: 'PG_SSL_REFUSED' }))
        return
      }
      const options = { socket, ca, rejectUnauthorized: true }
      if (!net.isIP(hostname)) options.servername = hostname
      const secure = tls.connect(options)
      secure.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      secure.once('secureConnect', () => {
        clearTimeout(timer)
        const authorized = secure.authorized === true
        secure.end()
        resolve({ authorized })
      })
    })
  })
}

const raw = process.env.OXANA_DATABASE_URL?.trim()
if (!raw) {
  fail('oxana_database_url_missing')
  process.exit()
}

let inspected
try {
  inspected = inspectUrl(raw)
} catch (error) {
  fail(error instanceof Error ? error.message : 'url_invalid')
  process.exit()
}

if (!Number.isInteger(inspected.port) || inspected.port <= 0) {
  fail('port_invalid')
  process.exit()
}

const connectHost = process.env.OXANA_DB_CONNECT_HOST?.trim()
const hostnameIsIp = net.isIP(inspected.hostname) !== 0
let records = []
let dnsCode = 'ok'
try {
  records = hostnameIsIp
    ? [{ address: inspected.hostname, family: 4 }]
    : await dns.promises.lookup(inspected.hostname, { all: true, family: 4 })
} catch (error) {
  dnsCode = error && error.code ? String(error.code) : 'dns_failed'
}

const ipv4 = records.map((item) => item.address)
const tcpHost =
  connectHost && net.isIPv4(connectHost) ? connectHost : inspected.hostname
log({
  ok: true,
  step: 'dns',
  hostname_is_ip: hostnameIsIp,
  connect_host_is_private_ip: connectHost === EXPECTED_PRIVATE_IP,
  dns_code: dnsCode,
  ipv4_count: ipv4.length,
  private_target_match: tcpHost === EXPECTED_PRIVATE_IP,
  extra_non_target_a: ipv4.some((address) => address !== EXPECTED_PRIVATE_IP),
  all_rfc1918: ipv4.length ? ipv4.every(isRfc1918) : tcpHost === EXPECTED_PRIVATE_IP,
})

if (hostnameIsIp) {
  fail('url_host_is_ip_tls_name_check_skipped')
  process.exit()
}

let ca
try {
  ca = loadCa()
  if (!ca.includes('BEGIN CERTIFICATE')) {
    fail('ca_invalid')
    process.exit()
  }
} catch {
  fail('ca_unreadable')
  process.exit()
}

try {
  const socket = await connectTcp(tcpHost, inspected.port)
  const tlsResult = await probeTls(socket, inspected.hostname, ca)
  log({
    ok: tlsResult.authorized,
    step: 'tls',
    reject_unauthorized: true,
    authorized: tlsResult.authorized,
  })
  if (!tlsResult.authorized) {
    fail('tls_unauthorized')
    process.exit()
  }
} catch (error) {
  fail('tls_failed', {
    error_name: error instanceof Error ? error.name : 'Error',
    error_code: error && error.code != null ? String(error.code) : undefined,
  })
  process.exit()
}

const tcpUrl = new URL(inspected.connectionString)
tcpUrl.hostname = tcpHost
const pool = new pg.Pool({
  connectionString: tcpUrl.toString(),
  ssl: { ca, rejectUnauthorized: true, servername: inspected.hostname },
  lookup: lookupIpv4,
  connectionTimeoutMillis: TIMEOUT_MS,
  max: 1,
  application_name: 'oxana-ai-diagnose',
  options: '-c search_path=oxana,pg_catalog',
})

try {
  const identity = await pool.query(
    `select current_user as db_user, current_database() as db_name`,
  )
  const row = identity.rows[0]
  const userOk = row?.db_user === 'oxana_app'
  const databaseOk = row?.db_name === 'default_db'
  const tables = await pool.query(
    `select c.relname as name
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'oxana' and c.relkind = 'r' and has_table_privilege(c.oid, 'select')
     order by 1`,
  )
  const counts = await pool.query(
    `select
       (select count(*)::text from oxana.workspaces) as workspaces,
       (select count(*)::text from oxana.tasks) as tasks`,
  )
  const pii = await pool.query(
    `select has_table_privilege('public.client_pii', 'select') as allowed`,
  )
  const readable = tables.rows.map((item) => item.name)
  const piiSelect = pii.rows[0]?.allowed === true
  log({
    ok: userOk && databaseOk && readable.length > 0 && !piiSelect,
    step: 'db',
    user_is_oxana_app: userOk,
    database_is_default_db: databaseOk,
    oxana_tables_readable: readable,
    oxana_counts_only: {
      workspaces: Number(counts.rows[0]?.workspaces ?? 0),
      tasks: Number(counts.rows[0]?.tasks ?? 0),
    },
    pii_select_privilege: piiSelect,
    pii_contents_not_read: true,
  })
  if (!userOk || !databaseOk || readable.length === 0 || piiSelect) process.exitCode = 1
} catch (error) {
  fail('db_failed', {
    error_name: error instanceof Error ? error.name : 'Error',
    error_code: error && error.code != null ? String(error.code) : undefined,
  })
} finally {
  await pool.end()
}
