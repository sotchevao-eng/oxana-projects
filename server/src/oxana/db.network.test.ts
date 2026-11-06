import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import tls from 'node:tls'
import type { PeerCertificate } from 'node:tls'
import pg from 'pg'
import { OxanaDbUnavailableError } from './errors.js'
import {
  buildOxanaTlsOptions,
  createOxanaCheckServerIdentity,
  inspectOxanaDatabaseUrl,
  parseOxanaConnectHost,
  resolveOxanaSocketTarget,
  shouldDisableOxanaSsl,
} from './db.js'

const OFFICIAL_HOST = 'cluster.example.twc1.net'
const PRIVATE_IP = '192.168.0.7'
const SAMPLE_CA = `-----BEGIN CERTIFICATE-----
MIIBdummy
-----END CERTIFICATE-----`

function inspectedUrl(hostname = OFFICIAL_HOST) {
  return inspectOxanaDatabaseUrl(
    `postgresql://oxana_app:secret-pass@${hostname}:5432/default_db?sslmode=require`,
  )
}

test('TCP pin uses private IP while TLS servername stays the official domain', () => {
  const inspected = inspectedUrl()
  const target = resolveOxanaSocketTarget(inspected, parseOxanaConnectHost(PRIVATE_IP))
  const ssl = buildOxanaTlsOptions(target.tlsServername ?? '', SAMPLE_CA)
  const tcpUrl = new URL(target.connectionString)

  assert.equal(inspected.hostname, OFFICIAL_HOST)
  assert.equal(target.tcpHost, PRIVATE_IP)
  assert.equal(tcpUrl.hostname, PRIVATE_IP)
  assert.equal(tcpUrl.username, 'oxana_app')
  assert.equal(tcpUrl.pathname, '/default_db')
  assert.equal(target.useSsl, true)
  assert.equal(target.tlsServername, OFFICIAL_HOST)
  assert.equal(ssl.servername, OFFICIAL_HOST)
  assert.equal(ssl.host, OFFICIAL_HOST)
  assert.equal(ssl.rejectUnauthorized, true)
  assert.notEqual(ssl.servername, target.tcpHost)
  assert.equal(tcpUrl.searchParams.get('sslmode'), null)

  const client = new pg.Client({
    connectionString: target.connectionString,
    ssl,
  })
  try {
    assert.equal(client.host, PRIVATE_IP)
    const clientSsl = client.ssl as unknown as typeof ssl
    assert.equal(clientSsl.servername, OFFICIAL_HOST)
    assert.equal(clientSsl.host, OFFICIAL_HOST)
    assert.equal(typeof clientSsl.checkServerIdentity, 'function')
  } finally {
    void client.end()
  }
})

test('TLS identity is checked against the official domain even if the TCP host is an IP', () => {
  const matchingCert = {
    subject: { CN: OFFICIAL_HOST },
    subjectaltname: `DNS:${OFFICIAL_HOST}`,
  } as PeerCertificate
  const foreignCert = {
    subject: { CN: 'other.example' },
    subjectaltname: 'DNS:other.example',
  } as PeerCertificate
  const check = createOxanaCheckServerIdentity(OFFICIAL_HOST)
  assert.equal(check(PRIVATE_IP, matchingCert), undefined)
  const mismatch = check(PRIVATE_IP, foreignCert)
  assert.equal(
    mismatch && 'code' in mismatch ? mismatch.code : undefined,
    'ERR_TLS_CERT_ALTNAME_INVALID',
  )
})

test('TLS options refuse an IP as the certificate name', () => {
  assert.throws(
    () => buildOxanaTlsOptions(PRIVATE_IP, SAMPLE_CA),
    OxanaDbUnavailableError,
  )
  assert.throws(() => buildOxanaTlsOptions(OFFICIAL_HOST, 'not-a-pem'), OxanaDbUnavailableError)
})

test('CONNECT_HOST rejects hostnames and public addresses', () => {
  assert.equal(parseOxanaConnectHost(undefined), undefined)
  assert.equal(parseOxanaConnectHost(''), undefined)
  assert.equal(parseOxanaConnectHost(PRIVATE_IP), PRIVATE_IP)
  assert.throws(() => parseOxanaConnectHost(OFFICIAL_HOST), OxanaDbUnavailableError)
  assert.throws(() => parseOxanaConnectHost('8.8.8.8'), OxanaDbUnavailableError)
  assert.throws(() => parseOxanaConnectHost('127.0.0.1'), OxanaDbUnavailableError)
})

test('CONNECT_HOST cannot be combined with an IP in the database URL', () => {
  const inspected = inspectedUrl(PRIVATE_IP)
  assert.throws(
    () => resolveOxanaSocketTarget(inspected, PRIVATE_IP),
    OxanaDbUnavailableError,
  )
})

test('CONNECT_HOST refuses local TLS disable so name verification cannot be skipped', () => {
  const inspected = inspectedUrl()
  const previous = process.env.OXANA_DB_SSL
  process.env.OXANA_DB_SSL = 'disable'
  try {
    assert.equal(shouldDisableOxanaSsl(OFFICIAL_HOST), false)
    assert.throws(
      () => resolveOxanaSocketTarget(inspected, PRIVATE_IP, '127.0.0.1'),
      OxanaDbUnavailableError,
    )
  } finally {
    if (previous === undefined) {
      delete process.env.OXANA_DB_SSL
    } else {
      process.env.OXANA_DB_SSL = previous
    }
  }
})

test('without CONNECT_HOST the TCP target stays the URL host', () => {
  const inspected = inspectedUrl()
  const target = resolveOxanaSocketTarget(inspected, undefined)
  assert.equal(target.tcpHost, OFFICIAL_HOST)
  assert.equal(target.tlsServername, OFFICIAL_HOST)
  assert.equal(target.useSsl, true)
})

const OPENSSL =
  process.env.OPENSSL_BIN?.trim() ||
  (existsSync('C:\\Program Files\\Git\\usr\\bin\\openssl.exe')
    ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
    : 'openssl')

function openssl(args: string[], cwd: string) {
  execFileSync(OPENSSL, args, { cwd, stdio: 'pipe' })
}

function handshakeWithOptions(
  serverCert: string,
  serverKey: string,
  clientOptions: tls.ConnectionOptions,
): Promise<Error | undefined> {
  return new Promise((resolve) => {
    const server = tls.createServer(
      { cert: serverCert, key: serverKey },
      (socket) => {
        socket.end()
      },
    )
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const raw = net.connect({ host: '127.0.0.1', port })
      raw.once('connect', () => {
        const secure = tls.connect({
          socket: raw,
          ...clientOptions,
        })
        const finish = (error?: Error) => {
          secure.destroy()
          raw.destroy()
          server.close()
          resolve(error)
        }
        secure.once('secureConnect', () => finish())
        secure.once('error', (error) => finish(error))
      })
      raw.once('error', (error) => {
        server.close()
        resolve(error)
      })
    })
  })
}

test('untrusted, expired and wrong-DNS certificates are rejected by standard TLS checks', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oxana-tls-'))
  try {
    openssl(
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        'ca.key',
        '-out',
        'ca.crt',
        '-days',
        '2',
        '-subj',
        '/CN=Oxana Test CA',
      ],
      dir,
    )
    openssl(
      [
        'req',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        'leaf.key',
        '-out',
        'leaf.csr',
        '-subj',
        `/CN=${OFFICIAL_HOST}`,
        '-addext',
        `subjectAltName=DNS:${OFFICIAL_HOST}`,
      ],
      dir,
    )
    openssl(
      [
        'x509',
        '-req',
        '-in',
        'leaf.csr',
        '-CA',
        'ca.crt',
        '-CAkey',
        'ca.key',
        '-CAcreateserial',
        '-out',
        'leaf.crt',
        '-days',
        '2',
        '-copy_extensions',
        'copyall',
      ],
      dir,
    )
    openssl(
      [
        'x509',
        '-req',
        '-in',
        'leaf.csr',
        '-CA',
        'ca.crt',
        '-CAkey',
        'ca.key',
        '-set_serial',
        '99',
        '-out',
        'expired.crt',
        '-not_before',
        '20200101000000Z',
        '-not_after',
        '20200102000000Z',
        '-copy_extensions',
        'copyall',
      ],
      dir,
    )
    openssl(
      [
        'req',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        'other.key',
        '-out',
        'other.csr',
        '-subj',
        '/CN=other.example',
        '-addext',
        'subjectAltName=DNS:other.example',
      ],
      dir,
    )
    openssl(
      [
        'x509',
        '-req',
        '-in',
        'other.csr',
        '-CA',
        'ca.crt',
        '-CAkey',
        'ca.key',
        '-set_serial',
        '7',
        '-out',
        'other.crt',
        '-days',
        '2',
        '-copy_extensions',
        'copyall',
      ],
      dir,
    )

    const ca = readFileSync(path.join(dir, 'ca.crt'), 'utf8')
    const leafCert = readFileSync(path.join(dir, 'leaf.crt'), 'utf8')
    const leafKey = readFileSync(path.join(dir, 'leaf.key'), 'utf8')
    const expiredCert = readFileSync(path.join(dir, 'expired.crt'), 'utf8')
    const otherCert = readFileSync(path.join(dir, 'other.crt'), 'utf8')
    const otherKey = readFileSync(path.join(dir, 'other.key'), 'utf8')
    const trusted = buildOxanaTlsOptions(OFFICIAL_HOST, ca)
    const untrusted = buildOxanaTlsOptions(OFFICIAL_HOST, SAMPLE_CA)

    const ok = await handshakeWithOptions(leafCert, leafKey, trusted)
    assert.equal(ok, undefined)

    const wrongDns = await handshakeWithOptions(otherCert, otherKey, trusted)
    assert.equal(wrongDns && 'code' in wrongDns ? wrongDns.code : undefined, 'ERR_TLS_CERT_ALTNAME_INVALID')

    const untrustedErr = await handshakeWithOptions(leafCert, leafKey, untrusted)
    assert.ok(untrustedErr)
    assert.notEqual(untrustedErr && 'code' in untrustedErr ? untrustedErr.code : '', undefined)

    const expired = await handshakeWithOptions(expiredCert, leafKey, trusted)
    const expiredCode = expired && 'code' in expired ? String(expired.code) : ''
    assert.ok(
      expiredCode.includes('EXPIRED') ||
        expiredCode === 'CERT_HAS_EXPIRED' ||
        expiredCode === 'ERR_CERT_HAS_EXPIRED',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
