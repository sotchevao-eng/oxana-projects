import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
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
let ephemeralDataDir: string | null = null
let ephemeralBin: string | null = null
let ephemeralError: string | null = null

function postgresBin(): string | null {
  const candidates = [
    process.env.OXANA_TEST_PG_BIN?.trim(),
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
  ].filter((item): item is string => Boolean(item))
  return candidates.find((item) => existsSync(path.join(item, 'pg_ctl.exe'))) ?? null
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

async function startEphemeralPostgres(): Promise<string | null> {
  const bin = postgresBin()
  if (!bin) {
    return null
  }
  const dataDir = mkdtempSync(path.join(tmpdir(), 'oxana-pg-'))
  ephemeralDataDir = dataDir
  ephemeralBin = bin
  try {
    const port = await reserveLocalPort()
    execFileSync(
      path.join(bin, 'initdb.exe'),
      [
        '-D',
        dataDir,
        '-U',
        'oxana',
        '--auth=trust',
        '--encoding=UTF8',
        '--locale=C',
        '--no-sync',
      ],
      { stdio: 'pipe', timeout: 30_000 },
    )
    writeFileSync(
      path.join(dataDir, 'postgresql.conf'),
      `${readFileSync(path.join(dataDir, 'postgresql.conf'), 'utf8')}
listen_addresses = '127.0.0.1'
port = ${port}
`,
      'utf8',
    )
    const child = spawn(
      path.join(bin, 'postgres.exe'),
      ['-D', dataDir, '-h', '127.0.0.1', '-p', String(port)],
      { detached: true, stdio: 'ignore' },
    )
    child.unref()
    const started = Date.now()
    let ready = false
    while (Date.now() - started < 15_000) {
      const probe = await tryConnect(`postgresql://oxana@127.0.0.1:${port}/postgres`)
      if (probe) {
        await probe.end()
        ready = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    if (!ready) {
      throw new Error('ephemeral postgres did not accept connections')
    }
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

function stopEphemeralPostgres(): void {
  if (ephemeralBin && ephemeralDataDir && existsSync(ephemeralDataDir)) {
    try {
      execFileSync(
        path.join(ephemeralBin, 'pg_ctl.exe'),
        ['stop', '-w', '-D', ephemeralDataDir, '-m', 'fast'],
        { stdio: 'pipe' },
      )
    } catch {
      // best-effort
    }
  }
  if (ephemeralDataDir) {
    rmSync(ephemeralDataDir, { recursive: true, force: true })
  }
  ephemeralDataDir = null
  ephemeralBin = null
}

async function connectIsolated(): Promise<pg.Client | null> {
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
  stopEphemeralPostgres()
})

test('isolated Postgres idempotency: replay, conflict, concurrent insert, reconnect', async (t) => {
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
