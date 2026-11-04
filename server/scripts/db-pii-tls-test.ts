/**
 * Diagnose TLS + pg handshake for Russian Postgres.
 * Does not migrate, read PII, or write data.
 * Never logs connection string / password / cert PEM / PII.
 *
 * Usage: npm run db:pii:tls-test
 */

import { readFileSync } from 'node:fs'
import net from 'node:net'
import tls from 'node:tls'
import pg from 'pg'
import { resolveCaCertPath } from '../src/db.js'

const TIMEOUT_MS = 10_000

/** PostgreSQL SSLRequest: int32 len=8, int32 code=80877103 */
const PG_SSL_REQUEST = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f])

type DbEndpoint = {
  hostname: string
  port: number
  user: string
  password: string
  database: string
}

function safeMessage(error: unknown): string {
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

function fail(error: unknown, code?: string | null) {
  const err = error as { code?: unknown; name?: unknown }
  console.info(
    JSON.stringify({
      ok: false,
      error_name: error instanceof Error ? error.name : null,
      code:
        code ??
        (typeof err.code === 'string' || typeof err.code === 'number'
          ? String(err.code)
          : null),
      message: safeMessage(error),
    }),
  )
  process.exitCode = 1
}

function parseEndpoint(): DbEndpoint {
  const raw = process.env.PII_DATABASE_URL?.trim()
  if (!raw) {
    throw new Error('PII_DATABASE_URL is not configured')
  }

  const url = new URL(raw)
  const hostname = url.hostname
  if (!hostname) {
    throw new Error('PII_DATABASE_URL hostname is missing')
  }

  const port = url.port ? Number(url.port) : 5432
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('PII_DATABASE_URL port is invalid')
  }

  const user = decodeURIComponent(url.username || '')
  const password = decodeURIComponent(url.password || '')
  const database = decodeURIComponent(url.pathname.replace(/^\//, '') || '')

  if (!user || !database) {
    throw new Error('PII_DATABASE_URL user or database is missing')
  }

  return { hostname, port, user, password, database }
}

function loadCa(): string {
  const caPathRaw = process.env.PII_DB_CA_CERT_PATH?.trim()
  if (!caPathRaw) {
    throw new Error('PII_DB_CA_CERT_PATH is not configured')
  }
  try {
    return readFileSync(resolveCaCertPath(caPathRaw), 'utf8')
  } catch {
    throw new Error('PII_DB_CA_CERT_PATH file is missing or unreadable')
  }
}

function cnOf(
  peer: tls.PeerCertificate | tls.DetailedPeerCertificate,
  side: 'subject' | 'issuer',
): string | null {
  const block = peer[side] as tls.Certificate & { CN?: string }
  if (typeof block?.CN === 'string' && block.CN) return block.CN
  return null
}

function probeTls(hostname: string, port: number, ca: string): Promise<{
  authorized: boolean
  authorizationError: string | null
  protocol: string | null
  cipher: string | null
  peerSubjectCn: string | null
  peerIssuerCn: string | null
}> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const timer = setTimeout(() => {
      socket.destroy()
      finish(() => reject(Object.assign(new Error('TLS probe timeout'), { code: 'ETIMEDOUT' })))
    }, TIMEOUT_MS)

    const socket = net.connect({ host: hostname, port })

    socket.once('error', (error) => {
      finish(() => reject(error))
    })

    socket.once('connect', () => {
      socket.write(PG_SSL_REQUEST)
    })

    socket.once('data', (chunk) => {
      const reply = chunk.toString('utf8', 0, 1)
      if (reply !== 'S') {
        socket.destroy()
        finish(() =>
          reject(
            Object.assign(new Error('PostgreSQL refused SSL (expected S)'), {
              code: 'PG_SSL_REFUSED',
            }),
          ),
        )
        return
      }

      const secure = tls.connect({
        socket,
        servername: hostname,
        ca,
        rejectUnauthorized: true,
        timeout: TIMEOUT_MS,
      })

      secure.once('error', (error) => {
        finish(() => reject(error))
      })

      secure.once('secureConnect', () => {
        const peer = secure.getPeerCertificate()
        const cipherInfo = secure.getCipher()
        const result = {
          authorized: secure.authorized,
          authorizationError: secure.authorizationError
            ? String(secure.authorizationError)
            : null,
          protocol: secure.getProtocol(),
          cipher: cipherInfo?.name ?? null,
          peerSubjectCn: peer ? cnOf(peer, 'subject') : null,
          peerIssuerCn: peer ? cnOf(peer, 'issuer') : null,
        }
        secure.end()
        finish(() => resolve(result))
      })
    })
  })
}

async function probePg(endpoint: DbEndpoint, ca: string): Promise<void> {
  const client = new pg.Client({
    host: endpoint.hostname,
    port: endpoint.port,
    user: endpoint.user,
    password: endpoint.password,
    database: endpoint.database,
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: endpoint.hostname,
    },
    connectionTimeoutMillis: TIMEOUT_MS,
  })

  try {
    await client.connect()
    const result = await client.query<{ ok: number }>('select 1 as ok')
    if (result.rows[0]?.ok !== 1) {
      throw new Error('SELECT 1 did not return ok=1')
    }
    console.info('PG_CONNECT_OK')
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function main() {
  let endpoint: DbEndpoint
  let ca: string
  try {
    endpoint = parseEndpoint()
    ca = loadCa()
  } catch (error) {
    fail(error, 'config_error')
    return
  }

  try {
    const tlsResult = await probeTls(endpoint.hostname, endpoint.port, ca)
    console.info('TLS_OK')
    console.info(
      JSON.stringify({
        authorized: tlsResult.authorized,
        authorizationError: tlsResult.authorizationError,
        protocol: tlsResult.protocol,
        cipher: tlsResult.cipher,
        peer_certificate_subject_cn: tlsResult.peerSubjectCn,
        peer_certificate_issuer_cn: tlsResult.peerIssuerCn,
      }),
    )
  } catch (error) {
    fail(error)
    return
  }

  try {
    await probePg(endpoint, ca)
  } catch (error) {
    fail(error)
  }
}

void main()
