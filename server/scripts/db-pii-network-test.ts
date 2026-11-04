/**
 * Safe DNS / IPv4 TCP / Postgres SSLRequest+TLS network diagnostics.
 * Does not migrate, read PII, or write data.
 * Never logs URL, username, password, cert PEM, or addresses.
 *
 * Usage: npm run db:pii:network-test
 */

import { readFileSync } from 'node:fs'
import dns from 'node:dns'
import net from 'node:net'
import tls from 'node:tls'
import { resolveCaCertPath } from '../src/db.js'

const TIMEOUT_MS = 10_000

/** PostgreSQL SSLRequest: int32 len=8, int32 code=80877103 */
const PG_SSL_REQUEST = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f])

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

function printError(error: unknown, code?: string | null) {
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
}

function parseHostPort(): { hostname: string; port: number } {
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
  return { hostname, port }
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

async function diagnoseDns(hostname: string): Promise<void> {
  const records = await dns.promises.lookup(hostname, { all: true })
  const families = [...new Set(records.map((item) => item.family))].sort()
  console.info(
    JSON.stringify({
      event: 'dns_lookup',
      address_count: records.length,
      families,
    }),
  )
}

function connectTcpIpv4(hostname: string, port: number): Promise<net.Socket> {
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
      finish(() =>
        reject(Object.assign(new Error('TCP IPv4 connect timeout'), { code: 'ETIMEDOUT' })),
      )
    }, TIMEOUT_MS)

    const socket = net.connect({
      host: hostname,
      port,
      family: 4,
    })

    socket.setTimeout(TIMEOUT_MS)

    socket.once('timeout', () => {
      socket.destroy()
      finish(() =>
        reject(Object.assign(new Error('TCP IPv4 socket timeout'), { code: 'ETIMEDOUT' })),
      )
    })

    socket.once('error', (error) => {
      finish(() => reject(error))
    })

    socket.once('connect', () => {
      finish(() => resolve(socket))
    })
  })
}

function upgradePostgresTls(
  socket: net.Socket,
  hostname: string,
  ca: string,
): Promise<{
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
      finish(() =>
        reject(Object.assign(new Error('TLS probe timeout'), { code: 'ETIMEDOUT' })),
      )
    }, TIMEOUT_MS)

    socket.once('error', (error) => {
      finish(() => reject(error))
    })

    socket.write(PG_SSL_REQUEST)

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

async function main() {
  let hostname: string
  let port: number
  try {
    ;({ hostname, port } = parseHostPort())
  } catch (error) {
    printError(error, 'config_error')
    process.exitCode = 1
    return
  }

  try {
    await diagnoseDns(hostname)
  } catch (error) {
    printError(error, 'dns_error')
    process.exitCode = 1
    return
  }

  let socket: net.Socket
  try {
    socket = await connectTcpIpv4(hostname, port)
    console.info('NODE_TCP_IPV4_OK')
  } catch (error) {
    printError(error)
    process.exitCode = 1
    return
  }

  let ca: string
  try {
    ca = loadCa()
  } catch (error) {
    socket.destroy()
    printError(error, 'config_error')
    process.exitCode = 1
    return
  }

  try {
    const tlsResult = await upgradePostgresTls(socket, hostname, ca)
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
    printError(error)
    process.exitCode = 1
  }
}

void main()
