import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { SignJWT } from 'jose'
import pg from 'pg'
import { createApp } from '../app.js'
import { SERVER_ROOT } from '../db.js'
import {
  closeOxanaPool,
  resetOxanaPoolForTests,
} from './db.js'
import { PgOxanaRepo } from './pgRepo.js'

/** Isolated PG tests run only when OXANA_RUN_PG_TESTS=1. Ordinary npm test must not start PostgreSQL. */

const TEST_SECRET = 'oxana-test-jwt-secret-please-change'
const OWNER_A = '11111111-1111-4111-8111-111111111111'
const FORBIDDEN_HOST_MARKERS = [
  'supabase.co',
  'supabase.com',
  'twc1.net',
  'timeweb',
  'amazonaws.com',
]
function assertLocalTestUrl(raw: string): string {
  const url = new URL(raw)
  const host = url.hostname.toLowerCase()
  if (FORBIDDEN_HOST_MARKERS.some((marker) => host.includes(marker))) {
    throw new Error('Refusing isolated Postgres URL: remote/production host')
  }
  const local = host === 'localhost' || host === '127.0.0.1'
  const named = url.pathname.includes('oxana_ai_test')
  if (!local && !named) {
    throw new Error('isolated Postgres URL must be localhost / oxana_ai_test')
  }
  return url.toString()
}

function repoRoot(): string {
  return path.resolve(SERVER_ROOT, '..')
}

async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_SECRET))
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

let previousUrl: string | undefined
let previousSsl: string | undefined
let previousAllowlist: string | undefined
let previousJwt: string | undefined
let isolatedUrl: string | null = null
let ephemeralError: string | null = null
let ownedCluster: {
  bin: string
  dataDir: string
  port: number
  logFile: string
  started: boolean
} | null = null
let stoppingCluster = false
let cleanupHooksBound = false

function pgTestsEnabled(): boolean {
  return process.env.OXANA_RUN_PG_TESTS === '1'
}

function pgExecutable(bin: string, name: 'initdb' | 'pg_ctl'): string {
  const file = process.platform === 'win32' ? `${name}.exe` : name
  return path.join(bin, file)
}

function runHiddenPg(
  bin: string,
  name: 'initdb' | 'pg_ctl',
  args: string[],
  timeoutMs = 30_000,
): string {
  try {
    return execFileSync(pgExecutable(bin, name), args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      encoding: 'utf8',
      timeout: timeoutMs,
    })
  } catch (error) {
    const err = error as { status?: number | null; stderr?: string; stdout?: string }
    const stderr = String(err.stderr ?? '').slice(0, 800)
    throw new Error(
      `${name} failed status=${err.status ?? 'unknown'} stderr=${stderr || 'none'}`,
    )
  }
}

function reportClusterStopFailure(reason: string): void {
  ephemeralError = reason
  const pidFile = ownedCluster
    ? path.join(ownedCluster.dataDir, 'postmaster.pid')
    : undefined
  console.error(
    JSON.stringify({
      event: 'oxana_ephemeral_pg_stop_failed',
      reason,
      dataDir: ownedCluster?.dataDir,
      logFile: ownedCluster?.logFile,
      port: ownedCluster?.port,
      postmasterPidFile: pidFile,
      postmasterPidPresent: pidFile ? existsSync(pidFile) : false,
    }),
  )
}

function postgresBin(): string | null {
  const candidates = [
    process.env.OXANA_TEST_PG_BIN?.trim(),
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
  ].filter((item): item is string => Boolean(item))
  const tool = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'
  return candidates.find((item) => existsSync(path.join(item, tool))) ?? null
}

function tryConnect(url: string): Promise<pg.Client | null> {
  const client = new pg.Client({
    connectionString: url,
    ssl: false,
    connectionTimeoutMillis: 1500,
  })
  return client
    .connect()
    .then(() => client)
    .catch(async () => {
      await client.end().catch(() => undefined)
      return null
    })
}

function reserveLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

function bindCleanupHooks(): void {
  if (cleanupHooksBound) {
    return
  }
  cleanupHooksBound = true
  process.on('exit', () => {
    stopEphemeralPostgres()
  })
  process.on('SIGINT', () => {
    stopEphemeralPostgres()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    stopEphemeralPostgres()
    process.exit(143)
  })
}

async function startEphemeralPostgres(): Promise<string | null> {
  if (!pgTestsEnabled()) {
    ephemeralError = 'isolated PostgreSQL tests require OXANA_RUN_PG_TESTS=1'
    return null
  }
  if (isolatedUrl && ownedCluster?.started) {
    return isolatedUrl
  }
  if (ownedCluster) {
    ephemeralError =
      'refusing a second ephemeral PostgreSQL cluster in this test process'
    return null
  }
  const bin = postgresBin()
  if (!bin) {
    ephemeralError = 'local PostgreSQL bin with pg_ctl was not found'
    return null
  }
  const dataDir = mkdtempSync(path.join(tmpdir(), 'oxana-pg-'))
  const logFile = path.join(dataDir, 'oxana-pg.log')
  const port = await reserveLocalPort()
  ownedCluster = { bin, dataDir, port, logFile, started: false }
  bindCleanupHooks()
  try {
    runHiddenPg(bin, 'initdb', [
      '-D',
      dataDir,
      '-U',
      'oxana',
      '--auth=trust',
      '--encoding=UTF8',
      '--locale=C',
      '--no-sync',
    ])
    writeFileSync(
      path.join(dataDir, 'postgresql.conf'),
      `${readFileSync(path.join(dataDir, 'postgresql.conf'), 'utf8')}
listen_addresses = '127.0.0.1'
port = ${port}
`,
      'utf8',
    )
    runHiddenPg(
      bin,
      'pg_ctl',
      ['start', '-w', '-t', '20', '-D', dataDir, '-l', logFile],
      40_000,
    )
    ownedCluster.started = true
    const bootstrap = new pg.Client({
      connectionString: `postgresql://oxana@127.0.0.1:${port}/postgres`,
      ssl: false,
      connectionTimeoutMillis: 3000,
    })
    await bootstrap.connect()
    try {
      await bootstrap.query('create database oxana_ai_test')
    } finally {
      await bootstrap.end()
    }
    return `postgresql://oxana@127.0.0.1:${port}/oxana_ai_test`
  } catch (error) {
    ephemeralError = error instanceof Error ? error.message : 'ephemeral_postgres_failed'
    stopEphemeralPostgres()
    return null
  }
}

function stopEphemeralPostgres(): boolean {
  if (!ownedCluster) {
    return true
  }
  if (stoppingCluster) {
    return false
  }
  stoppingCluster = true
  const cluster = ownedCluster
  const pidFile = path.join(cluster.dataDir, 'postmaster.pid')
  try {
    if (cluster.started || existsSync(pidFile)) {
      try {
        runHiddenPg(
          cluster.bin,
          'pg_ctl',
          ['stop', '-w', '-t', '20', '-D', cluster.dataDir, '-m', 'fast'],
          40_000,
        )
      } catch (error) {
        reportClusterStopFailure(
          error instanceof Error ? error.message : 'pg_ctl stop failed',
        )
        return false
      }
      if (existsSync(pidFile)) {
        reportClusterStopFailure('postmaster.pid still present after pg_ctl stop')
        return false
      }
    }
    try {
      rmSync(cluster.dataDir, { recursive: true, force: true })
    } catch (error) {
      reportClusterStopFailure(
        error instanceof Error
          ? `failed to remove dataDir: ${error.message}`
          : 'failed to remove dataDir',
      )
      return false
    }
    ownedCluster = null
    return true
  } finally {
    stoppingCluster = false
  }
}

async function connectIsolated(): Promise<pg.Client | null> {
  if (!pgTestsEnabled()) {
    ephemeralError = 'isolated PostgreSQL tests require OXANA_RUN_PG_TESTS=1'
    return null
  }
  if (isolatedUrl) {
    return tryConnect(isolatedUrl)
  }
  const candidates = [
    process.env.OXANA_TEST_DATABASE_URL?.trim(),
  ].filter((item): item is string => Boolean(item))
  for (const raw of candidates) {
    let url: string
    try {
      url = assertLocalTestUrl(raw)
    } catch {
      continue
    }
    const client = await tryConnect(url)
    if (client) {
      isolatedUrl = url
      return client
    }
  }
  const ephemeral = await startEphemeralPostgres()
  if (!ephemeral) {
    return null
  }
  isolatedUrl = assertLocalTestUrl(ephemeral)
  return tryConnect(isolatedUrl)
}

async function prepareIsolatedSchema(client: pg.Client): Promise<void> {
  await client.query(`
    do $role$
    begin
      if not exists (select 1 from pg_roles where rolname = 'oxana_app') then
        create role oxana_app nologin;
      end if;
    end
    $role$;
  `)
  const schemaSql = readFileSync(
    path.join(repoRoot(), 'russian-postgres', 'oxana-ai.sql'),
    'utf8',
  )
  await client.query(schemaSql)
  await client.query(`
    alter table oxana.tasks
      add column if not exists priority text not null default 'normal';
    alter table oxana.tasks
      add column if not exists archived_at timestamptz;
    drop table if exists oxana.task_create_keys;
  `)
  await client.query(`select set_config('oxana.allow_isolated_test', 'on', false)`)
  const migrationSql = readFileSync(
    path.join(
      repoRoot(),
      'russian-postgres',
      'oxana-task-create-idempotency.sql',
    ),
    'utf8',
  )
  await client.query(migrationSql)
}

async function resetCabinet(client: pg.Client): Promise<void> {
  await client.query(`
    truncate table
      oxana.task_create_keys,
      oxana.jobs,
      oxana.notifications,
      oxana.messages,
      oxana.conversations,
      oxana.events,
      oxana.tasks,
      oxana.projects,
      oxana.ai_settings,
      oxana.workspace_members,
      oxana.workspaces,
      oxana.identities
    restart identity cascade
  `)
}

function bindAppEnv(url: string): void {
  previousUrl = process.env.OXANA_DATABASE_URL
  previousSsl = process.env.OXANA_DB_SSL
  previousAllowlist = process.env.OXANA_ALLOWED_USER_IDS
  previousJwt = process.env.SUPABASE_JWT_SECRET
  process.env.OXANA_DATABASE_URL = url
  process.env.OXANA_DB_SSL = 'disable'
  process.env.OXANA_ALLOWED_USER_IDS = OWNER_A
  process.env.SUPABASE_JWT_SECRET = TEST_SECRET
  resetOxanaPoolForTests()
}

function restoreAppEnv(): void {
  if (previousUrl === undefined) delete process.env.OXANA_DATABASE_URL
  else process.env.OXANA_DATABASE_URL = previousUrl
  if (previousSsl === undefined) delete process.env.OXANA_DB_SSL
  else process.env.OXANA_DB_SSL = previousSsl
  if (previousAllowlist === undefined) delete process.env.OXANA_ALLOWED_USER_IDS
  else process.env.OXANA_ALLOWED_USER_IDS = previousAllowlist
  if (previousJwt === undefined) delete process.env.SUPABASE_JWT_SECRET
  else process.env.SUPABASE_JWT_SECRET = previousJwt
  resetOxanaPoolForTests()
}

after(async () => {
  await closeOxanaPool().catch(() => undefined)
  restoreAppEnv()
  if (!stopEphemeralPostgres() && ownedCluster) {
    throw new Error(
      ephemeralError ??
        'ephemeral PostgreSQL stop failed; data directory kept for diagnostics',
    )
  }
})

test('ordinary npm test does not start ephemeral PostgreSQL', (t) => {
  if (pgTestsEnabled()) {
    t.skip('OXANA_RUN_PG_TESTS=1 is set')
    return
  }
  assert.equal(ownedCluster, null)
  assert.equal(isolatedUrl, null)
})

test('isolated Postgres idempotency: replay, conflict, concurrent insert, reconnect', async (t) => {
  if (!pgTestsEnabled()) {
    t.skip('isolated PostgreSQL tests require OXANA_RUN_PG_TESTS=1')
    return
  }
  const admin = await connectIsolated()
  if (!admin || !isolatedUrl) {
    t.skip(ephemeralError ?? 'isolated PostgreSQL is not running')
    return
  }

  try {
    await prepareIsolatedSchema(admin)
    const grants = await admin.query<{
      sel: boolean
      ins: boolean
      upd: boolean
      del: boolean
    }>(
      `select
         has_table_privilege('oxana_app', 'oxana.task_create_keys', 'SELECT') as sel,
         has_table_privilege('oxana_app', 'oxana.task_create_keys', 'INSERT') as ins,
         has_table_privilege('oxana_app', 'oxana.task_create_keys', 'UPDATE') as upd,
         has_table_privilege('oxana_app', 'oxana.task_create_keys', 'DELETE') as del`,
    )
    assert.equal(grants.rows[0]?.sel, true)
    assert.equal(grants.rows[0]?.ins, true)
    assert.equal(grants.rows[0]?.upd, true)
    assert.equal(grants.rows[0]?.del, false)

    const pk = await admin.query<{ column_name: string }>(
      `select a.attname as column_name
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'oxana'
         and c.relname = 'task_create_keys'
         and i.indisprimary
       order by array_position(i.indkey, a.attnum)`,
    )
    assert.deepEqual(
      pk.rows.map((row) => row.column_name),
      ['user_id', 'idempotency_key'],
    )

    const altered = await admin.query<{ count: string }>(
      `select count(*)::text as count
       from information_schema.columns
       where table_schema = 'oxana'
         and table_name = 'tasks'
         and column_name = 'idempotency_key'`,
    )
    assert.equal(altered.rows[0]?.count, '0')

    await resetCabinet(admin)
    bindAppEnv(isolatedUrl)
    const repo = new PgOxanaRepo()
    const app = createApp({ oxanaRepo: repo })
    const token = await signToken(OWNER_A)
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    const key = 'e4e4e4e4-e4e4-44e4-84e4-e4e4e4e4e4e4'
    const payload = {
      title: 'Проверить документы поставщика',
      priority: 'high',
      idempotencyKey: key,
    }

    const first = await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const firstBody = await readJson(first)
    assert.equal(first.status, 201)
    const taskId = (firstBody.task as Record<string, unknown>).id

    const replay = await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const replayBody = await readJson(replay)
    assert.equal(replay.status, 200)
    assert.equal((replayBody.task as Record<string, unknown>).id, taskId)

    const conflict = await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        title: 'Другая задача',
      }),
    })
    const conflictBody = await readJson(conflict)
    assert.equal(conflict.status, 409)
    assert.equal(conflictBody.error, 'idempotency_key_conflict')

    const counts = await admin.query<{ tasks: string; keys: string }>(
      `select
         (select count(*)::text from oxana.tasks) as tasks,
         (select count(*)::text from oxana.task_create_keys) as keys`,
    )
    assert.equal(counts.rows[0]?.tasks, '1')
    assert.equal(counts.rows[0]?.keys, '1')

    await resetCabinet(admin)
    const concurrentKey = 'f5f5f5f5-f5f5-45f5-85f5-f5f5f5f5f5f5'
    const concurrentPayload = JSON.stringify({
      title: 'Одновременное создание',
      priority: 'normal',
      idempotencyKey: concurrentKey,
    })
    const [left, right] = await Promise.all([
      app.request('/api/oxana/tasks', {
        method: 'POST',
        headers,
        body: concurrentPayload,
      }),
      app.request('/api/oxana/tasks', {
        method: 'POST',
        headers,
        body: concurrentPayload,
      }),
    ])
    const leftBody = await readJson(left)
    const rightBody = await readJson(right)
    assert.equal([201, 200].includes(left.status), true)
    assert.equal([201, 200].includes(right.status), true)
    assert.equal(
      (leftBody.task as Record<string, unknown>).id,
      (rightBody.task as Record<string, unknown>).id,
    )
    const concurrentCounts = await admin.query<{ tasks: string }>(
      `select count(*)::text as tasks from oxana.tasks`,
    )
    assert.equal(concurrentCounts.rows[0]?.tasks, '1')

    const reconnectKey = 'a6a6a6a6-a6a6-46a6-86a6-a6a6a6a6a6a6'
    const reconnectPayload = {
      title: 'После переподключения',
      priority: 'low',
      idempotencyKey: reconnectKey,
    }
    await resetCabinet(admin)
    const created = await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify(reconnectPayload),
    })
    const createdBody = await readJson(created)
    assert.equal(created.status, 201)
    await closeOxanaPool()
    resetOxanaPoolForTests()
    const reconnected = createApp({ oxanaRepo: new PgOxanaRepo() })
    const afterReconnect = await reconnected.request('/api/oxana/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify(reconnectPayload),
    })
    const afterBody = await readJson(afterReconnect)
    assert.equal(afterReconnect.status, 200)
    assert.equal(
      (afterBody.task as Record<string, unknown>).id,
      (createdBody.task as Record<string, unknown>).id,
    )
    const reconnectCounts = await admin.query<{ tasks: string }>(
      `select count(*)::text as tasks from oxana.tasks`,
    )
    assert.equal(reconnectCounts.rows[0]?.tasks, '1')
  } finally {
    await closeOxanaPool().catch(() => undefined)
    restoreAppEnv()
    await admin.end()
  }
})

test('isolated Postgres task patch: atomic version, replay, concurrent writes', async (t) => {
  if (!pgTestsEnabled()) {
    t.skip('isolated PostgreSQL tests require OXANA_RUN_PG_TESTS=1')
    return
  }
  const admin = await connectIsolated()
  if (!admin || !isolatedUrl) {
    t.skip(ephemeralError ?? 'isolated PostgreSQL is not running')
    return
  }

  try {
    await prepareIsolatedSchema(admin)
    await resetCabinet(admin)
    bindAppEnv(isolatedUrl)
    const app = createApp({ oxanaRepo: new PgOxanaRepo() })
    const token = await signToken(OWNER_A)
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    const created = await readJson(
      await app.request('/api/oxana/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Конкурентный PATCH',
          description: 'оставить',
          dueAt: '2026-11-13T20:59:00.000Z',
          priority: 'normal',
        }),
      }),
    )
    assert.equal(typeof (created.task as Record<string, unknown>)?.id, 'string')
    const task = created.task as Record<string, unknown>
    const taskId = String(task.id)
    const expectedMs = String(task.updatedAt)

    const sameBody = JSON.stringify({
      priority: 'high',
      expectedUpdatedAt: expectedMs,
    })
    const first = await app.request(`/api/oxana/tasks/${taskId}`, {
      method: 'PATCH',
      headers,
      body: sameBody,
    })
    const firstBody = await readJson(first)
    assert.equal(first.status, 200)
    assert.equal((firstBody.task as Record<string, unknown>).priority, 'high')
    assert.equal(
      (firstBody.task as Record<string, unknown>).dueAt,
      '2026-11-13T20:59:00.000Z',
    )
    assert.equal(
      (firstBody.task as Record<string, unknown>).description,
      'оставить',
    )
    const afterFirst = String((firstBody.task as Record<string, unknown>).updatedAt)
    assert.notEqual(afterFirst, expectedMs)

    const lostResponse = await app.request(`/api/oxana/tasks/${taskId}`, {
      method: 'PATCH',
      headers,
      body: sameBody,
    })
    const lostBody = await readJson(lostResponse)
    assert.equal(lostResponse.status, 409)
    assert.equal(lostBody.error, 'task_changed')
    const afterLost = await readJson(
      await app.request('/api/oxana/tasks', { headers }),
    )
    const afterLostTask = (afterLost.tasks as Array<Record<string, unknown>>)[0]
    assert.equal(afterLostTask?.priority, 'high')
    assert.equal(String(afterLostTask?.updatedAt), afterFirst)

    const otherContent = await app.request(`/api/oxana/tasks/${taskId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        priority: 'urgent',
        expectedUpdatedAt: expectedMs,
      }),
    })
    const otherBody = await readJson(otherContent)
    assert.equal(otherContent.status, 409)
    assert.equal(otherBody.error, 'task_changed')

    await resetCabinet(admin)
    const seed = await readJson(
      await app.request('/api/oxana/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'Два PATCH', priority: 'normal' }),
      }),
    )
    const concurrentId = String((seed.task as Record<string, unknown>).id)
    const concurrentExpected = String(
      (seed.task as Record<string, unknown>).updatedAt,
    )
    const concurrentBody = JSON.stringify({
      priority: 'high',
      expectedUpdatedAt: concurrentExpected,
    })
    const [left, right] = await Promise.all([
      app.request(`/api/oxana/tasks/${concurrentId}`, {
        method: 'PATCH',
        headers,
        body: concurrentBody,
      }),
      app.request(`/api/oxana/tasks/${concurrentId}`, {
        method: 'PATCH',
        headers,
        body: concurrentBody,
      }),
    ])
    const leftBody = await readJson(left)
    const rightBody = await readJson(right)
    const concurrentStatuses = [left.status, right.status].sort()
    assert.deepEqual(concurrentStatuses, [200, 409])
    const winner =
      left.status === 200 ? leftBody.task : rightBody.task
    assert.equal((winner as Record<string, unknown>).priority, 'high')
    const winnerUpdatedAt = String(
      (winner as Record<string, unknown>).updatedAt,
    )

    const mixed = await Promise.all([
      app.request(`/api/oxana/tasks/${concurrentId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          title: 'Левый',
          expectedUpdatedAt: winnerUpdatedAt,
        }),
      }),
      app.request(`/api/oxana/tasks/${concurrentId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          title: 'Правый',
          expectedUpdatedAt: winnerUpdatedAt,
        }),
      }),
    ])
    const mixedStatuses = mixed.map((item) => item.status).sort()
    assert.deepEqual(mixedStatuses, [200, 409])
    const kept = await readJson(
      await app.request('/api/oxana/tasks', { headers }),
    )
    const keptTitle = (kept.tasks as Array<Record<string, unknown>>)[0]?.title
    assert.equal(['Левый', 'Правый'].includes(String(keptTitle)), true)
  } finally {
    await closeOxanaPool().catch(() => undefined)
    restoreAppEnv()
    await admin.end()
  }
})
