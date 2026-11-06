import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OxanaDbUnavailableError } from './errors.js'
import {
  buildOxanaTlsOptions,
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
  assert.equal(ssl.rejectUnauthorized, true)
  assert.notEqual(ssl.servername, target.tcpHost)
  assert.equal(tcpUrl.searchParams.get('sslmode'), null)
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
