import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { SignJWT } from 'jose'
import { resolveCaCertPath, SERVER_ROOT } from '../db.js'
import { createApp } from '../app.js'
import { inspectOxanaDatabaseUrl, shouldDisableOxanaSsl } from './db.js'
import { MemoryOxanaRepo } from './memoryRepo.js'
import { createSupabaseTokenVerifier } from './tokenVerifier.js'
import type { OxanaEvent, OxanaTask } from './types.js'

const TEST_SECRET = 'oxana-test-jwt-secret-please-change'
const OWNER_A = '11111111-1111-4111-8111-111111111111'
const OWNER_B = '22222222-2222-4222-8222-222222222222'
const STRANGER = '33333333-3333-4333-8333-333333333333'

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

let previousAllowlist: string | undefined
let previousJwtSecret: string | undefined
let previousOxanaUrl: string | undefined

beforeEach(() => {
  previousAllowlist = process.env.OXANA_ALLOWED_USER_IDS
  previousJwtSecret = process.env.SUPABASE_JWT_SECRET
  previousOxanaUrl = process.env.OXANA_DATABASE_URL
  process.env.SUPABASE_JWT_SECRET = TEST_SECRET
  process.env.OXANA_ALLOWED_USER_IDS = `${OWNER_A},${OWNER_B}`
  delete process.env.OXANA_DATABASE_URL
})

afterEach(() => {
  if (previousAllowlist === undefined) {
    delete process.env.OXANA_ALLOWED_USER_IDS
  } else {
    process.env.OXANA_ALLOWED_USER_IDS = previousAllowlist
  }
  if (previousJwtSecret === undefined) {
    delete process.env.SUPABASE_JWT_SECRET
  } else {
    process.env.SUPABASE_JWT_SECRET = previousJwtSecret
  }
  if (previousOxanaUrl === undefined) {
    delete process.env.OXANA_DATABASE_URL
  } else {
    process.env.OXANA_DATABASE_URL = previousOxanaUrl
  }
})

test('rejects missing bearer token', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const response = await app.request('/api/oxana/tasks')
  const body = await readJson(response)
  assert.equal(response.status, 401)
  assert.equal(body.error, 'unauthorized')
})

test('rejects valid JWT that is not on the allowlist', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(STRANGER)
  const response = await app.request('/api/oxana/tasks', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await readJson(response)
  assert.equal(response.status, 403)
  assert.equal(body.error, 'oxana_forbidden')
})

test('fails closed when allowlist is empty', async () => {
  process.env.OXANA_ALLOWED_USER_IDS = ''
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const response = await app.request('/api/oxana/tasks', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await readJson(response)
  assert.equal(response.status, 503)
  assert.equal(body.error, 'oxana_allowlist_missing')
})

test('prefers owner workspace when the user also has a client workspace', async () => {
  const repo = new MemoryOxanaRepo()
  const ownerWorkspace = await repo.ensureWorkspaceForUser(OWNER_A)
  const clientWorkspace = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'client-acme',
    name: 'Клиент',
    kind: 'client' as const,
  }
  repo.assignUserToWorkspace(OWNER_A, clientWorkspace)
  await repo.createTask(clientWorkspace.id, OWNER_A, {
    title: 'Клиентская задача',
    description: null,
    projectId: null,
    dueAt: null,
    priority: 'normal',
  })
  await repo.createTask(ownerWorkspace.id, OWNER_A, {
    title: 'Личная задача',
    description: null,
    projectId: null,
    dueAt: null,
    priority: 'normal',
  })

  const resolved = await repo.ensureWorkspaceForUser(OWNER_A)
  assert.equal(resolved.kind, 'owner')
  assert.equal(resolved.id, ownerWorkspace.id)

  const app = createApp({ oxanaRepo: repo })
  const token = await signToken(OWNER_A)
  const listed = await readJson(
    await app.request('/api/oxana/tasks', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  const titles = ((listed.tasks as Array<{ title: string }>) ?? []).map(
    (task) => task.title,
  )
  assert.deepEqual(titles, ['Личная задача'])
})

test('owner APIs and reminders keep the existing owner workspace', async () => {
  class ReminderSpyRepo extends MemoryOxanaRepo {
    taskReminderWorkspaces: string[] = []
    eventReminderWorkspaces: string[] = []

    async scheduleRemindersForTask(
      workspaceId: string,
      _userId: string,
      _task: OxanaTask,
    ): Promise<void> {
      this.taskReminderWorkspaces.push(workspaceId)
    }

    async scheduleRemindersForEvent(
      workspaceId: string,
      _userId: string,
      _event: OxanaEvent,
    ): Promise<void> {
      this.eventReminderWorkspaces.push(workspaceId)
    }
  }

  const repo = new ReminderSpyRepo()
  const ownerWorkspace = await repo.ensureWorkspaceForUser(OWNER_A)
  await repo.createTask(ownerWorkspace.id, OWNER_A, {
    title: 'Личная задача',
    description: 'не должна пропасть',
    projectId: null,
    dueAt: null,
    priority: 'normal',
  })
  await repo.createProject(ownerWorkspace.id, OWNER_A, {
    title: 'проект 1',
    description: null,
    status: 'active',
    startsAt: null,
    dueAt: null,
  })
  await repo.createEvent(ownerWorkspace.id, OWNER_A, {
    title: 'Встреча ОКСИ',
    description: null,
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    endsAt: null,
    remindAt: null,
    projectId: null,
  })
  repo.assignUserToWorkspace(OWNER_A, {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'client-acme',
    name: 'Клиент',
    kind: 'client',
  })

  const again = await repo.ensureWorkspaceForUser(OWNER_A)
  assert.equal(again.id, ownerWorkspace.id)
  assert.equal(again.kind, 'owner')

  const app = createApp({ oxanaRepo: repo })
  const token = await signToken(OWNER_A)
  const headers = { Authorization: `Bearer ${token}` }
  const writeHeaders = {
    ...headers,
    'Content-Type': 'application/json',
  }

  const status = await readJson(await app.request('/api/oxana/status', { headers }))
  assert.equal((status.workspace as Record<string, unknown>).id, ownerWorkspace.id)
  assert.equal((status.workspace as Record<string, unknown>).kind, 'owner')

  const tasks = await readJson(await app.request('/api/oxana/tasks', { headers }))
  assert.deepEqual(
    ((tasks.tasks as Array<{ title: string }>) ?? []).map((item) => item.title),
    ['Личная задача'],
  )

  const overview = await readJson(
    await app.request('/api/oxana/overview', { headers }),
  )
  assert.deepEqual(
    ((overview.activeProjects as Array<{ title: string }>) ?? []).map(
      (item) => item.title,
    ),
    ['проект 1'],
  )
  assert.deepEqual(
    ((overview.upcomingEvents as Array<{ title: string }>) ?? []).map(
      (item) => item.title,
    ),
    ['Встреча ОКСИ'],
  )

  const projects = await readJson(
    await app.request('/api/oxana/projects', { headers }),
  )
  assert.deepEqual(
    ((projects.projects as Array<{ title: string }>) ?? []).map((item) => item.title),
    ['проект 1'],
  )

  const events = await readJson(await app.request('/api/oxana/events', { headers }))
  assert.deepEqual(
    ((events.events as Array<{ title: string }>) ?? []).map((item) => item.title),
    ['Встреча ОКСИ'],
  )

  const settings = await readJson(
    await app.request('/api/oxana/settings', { headers }),
  )
  assert.equal(settings.ok, true)

  const notes = await readJson(
    await app.request('/api/oxana/notifications', { headers }),
  )
  assert.equal(Array.isArray(notes.notifications), true)

  const createdTask = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({ title: 'Новая личная задача' }),
    }),
  )
  assert.equal(createdTask.ok, true)
  assert.deepEqual(repo.taskReminderWorkspaces, [ownerWorkspace.id])

  const createdEvent = await readJson(
    await app.request('/api/oxana/events', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({
        title: 'Новая встреча',
        startsAt: new Date(Date.now() + 7_200_000).toISOString(),
      }),
    }),
  )
  assert.equal(createdEvent.ok, true)
  assert.deepEqual(repo.eventReminderWorkspaces, [ownerWorkspace.id])
})

test('creates and lists tasks for the owner workspace only', async () => {
  const repo = new MemoryOxanaRepo()
  const app = createApp({ oxanaRepo: repo })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)

  const created = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Собрать бриф', description: 'до пятницы' }),
  })
  const createdBody = await readJson(created)
  assert.equal(created.status, 201)
  assert.equal(createdBody.ok, true)
  const task = createdBody.task as Record<string, unknown>
  assert.equal(task.title, 'Собрать бриф')
  assert.equal(task.status, 'open')
  assert.equal(task.createdBy, OWNER_A)

  const listA = await app.request('/api/oxana/tasks', {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const listABody = await readJson(listA)
  assert.equal(listA.status, 200)
  assert.equal((listABody.tasks as unknown[]).length, 1)

  const listB = await app.request('/api/oxana/tasks', {
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  const listBBody = await readJson(listB)
  assert.equal(listB.status, 200)
  assert.equal((listBBody.tasks as unknown[]).length, 0)
})

test('cannot change another workspace task status', async () => {
  const repo = new MemoryOxanaRepo()
  const app = createApp({ oxanaRepo: repo })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)

  const created = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Чужая задача' }),
  })
  const createdBody = await readJson(created)
  const task = createdBody.task as Record<string, unknown>

  const patched = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'done' }),
  })
  const patchedBody = await readJson(patched)
  assert.equal(patched.status, 404)
  assert.equal(patchedBody.error, 'oxana_not_found')
})

test('rejects empty task title', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const response = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: '   ' }),
  })
  const body = await readJson(response)
  assert.equal(response.status, 400)
  assert.equal(body.error, 'title_required')
})

test('updates task status for the owner', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const created = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Проверить календарь' }),
  })
  const createdBody = await readJson(created)
  const task = createdBody.task as Record<string, unknown>

  const patched = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'in_progress' }),
  })
  const patchedBody = await readJson(patched)
  assert.equal(patched.status, 200)
  assert.equal((patchedBody.task as Record<string, unknown>).status, 'in_progress')
})

test('lists created projects for the same workspace only', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)

  const created = await app.request('/api/oxana/projects', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Кабинет ОКСИ' }),
  })
  assert.equal(created.status, 201)

  const listA = await readJson(
    await app.request('/api/oxana/projects', {
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  const listB = await readJson(
    await app.request('/api/oxana/projects', {
      headers: { Authorization: `Bearer ${tokenB}` },
    }),
  )
  assert.equal((listA.projects as unknown[]).length, 1)
  assert.equal((listB.projects as unknown[]).length, 0)
})

test('does not fake a successful write when OXANA DB is missing', async () => {
  const app = createApp()
  const token = await signToken(OWNER_A)
  const response = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Не должна сохраниться' }),
  })
  const body = await readJson(response)
  assert.equal(response.status, 503)
  assert.equal(body.error, 'oxana_db_unavailable')
  assert.equal(body.ok, false)
})

test('chat contract refuses to impersonate a working model', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const response = await app.request('/api/oxana/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'Привет, Окси' }),
  })
  const body = await readJson(response)
  assert.equal(response.status, 503)
  assert.equal(body.error, 'ai_not_configured')
  assert.equal(body.ok, false)
  assert.equal(body.reply, undefined)
})

test('existing PII health and unauthorized PII write still work', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const health = await readJson(await app.request('/api/health'))
  assert.equal(health.ok, true)
  assert.equal(health.service, 'oxana-pii-api')

  const pii = await app.request('/api/pii', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Test' }),
  })
  const piiBody = await readJson(pii)
  assert.equal(pii.status, 401)
  assert.equal(piiBody.error, 'unauthorized')
})

test('OXANA DB URL cannot point at Supabase', () => {
  assert.throws(() =>
    inspectOxanaDatabaseUrl(
      'postgresql://postgres.abc@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
    ),
  )
  const local = inspectOxanaDatabaseUrl(
    'postgresql://oxana:oxana_test@127.0.0.1:55432/oxana_ai_test',
  )
  assert.equal(local.hostname, '127.0.0.1')
  assert.equal(shouldDisableOxanaSsl('twc1.net'), false)
})

test('token verifier stays swappable without changing task routes', () => {
  const verifier = createSupabaseTokenVerifier()
  assert.equal(verifier.provider, 'supabase')
})

test('links a task to a workspace project and keeps personal tasks', async () => {
  const repo = new MemoryOxanaRepo()
  const app = createApp({ oxanaRepo: repo })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)

  const projectA = await readJson(
    await app.request('/api/oxana/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Кабинет ОКСИ' }),
    }),
  )
  const projectB = await readJson(
    await app.request('/api/oxana/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Чужой проект' }),
    }),
  )
  const projectAId = (projectA.project as Record<string, unknown>).id
  const projectBId = (projectB.project as Record<string, unknown>).id

  const personal = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Личная задача' }),
    }),
  )
  assert.equal(personal.ok, true)
  assert.equal((personal.task as Record<string, unknown>).projectId, null)

  const linked = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Собрать бриф',
      projectId: projectAId,
    }),
  })
  const linkedBody = await readJson(linked)
  assert.equal(linked.status, 201)
  assert.equal((linkedBody.task as Record<string, unknown>).projectId, projectAId)
  assert.equal(
    (linkedBody.task as Record<string, unknown>).projectTitle,
    'Кабинет ОКСИ',
  )

  const foreign = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Не должна привязаться',
      projectId: projectBId,
    }),
  })
  const foreignBody = await readJson(foreign)
  assert.equal(foreign.status, 404)
  assert.equal(foreignBody.error, 'oxana_not_found')

  const taskId = (linkedBody.task as Record<string, unknown>).id as string
  const moved = await readJson(
    await app.request(`/api/oxana/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectId: null }),
    }),
  )
  assert.equal(moved.ok, true)
  assert.equal((moved.task as Record<string, unknown>).projectId, null)

  const restored = await readJson(
    await app.request(`/api/oxana/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectId: projectAId }),
    }),
  )
  assert.equal((restored.task as Record<string, unknown>).projectId, projectAId)

  const card = await app.request(`/api/oxana/projects/${projectAId}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const cardBody = await readJson(card)
  assert.equal(card.status, 200)
  assert.equal((cardBody.tasks as unknown[]).length, 1)

  const stolen = await app.request(`/api/oxana/projects/${projectAId}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  const stolenBody = await readJson(stolen)
  assert.equal(stolen.status, 404)
  assert.equal(stolenBody.error, 'oxana_not_found')
})

test('creates, edits and deletes events only inside the owner workspace', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)
  const startsAt = new Date(Date.now() + 3600_000).toISOString()

  const created = await app.request('/api/oxana/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Созвон с клиентом', startsAt }),
  })
  const createdBody = await readJson(created)
  assert.equal(created.status, 201)
  const eventId = (createdBody.event as Record<string, unknown>).id as string

  const listB = await readJson(
    await app.request('/api/oxana/events', {
      headers: { Authorization: `Bearer ${tokenB}` },
    }),
  )
  assert.equal((listB.events as unknown[]).length, 0)

  const stolen = await app.request(`/api/oxana/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Чужое' }),
  })
  assert.equal(stolen.status, 404)

  const patched = await readJson(
    await app.request(`/api/oxana/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Созвон перенесён' }),
    }),
  )
  assert.equal((patched.event as Record<string, unknown>).title, 'Созвон перенесён')

  const deletedByStranger = await app.request(`/api/oxana/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  assert.equal(deletedByStranger.status, 404)

  const deleted = await app.request(`/api/oxana/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  assert.equal(deleted.status, 200)
})

test('edits a task and rejects a foreign delete', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)
  const dueAt = new Date(Date.now() + 86_400_000).toISOString()
  const created = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Старое название' }),
    }),
  )
  const taskId = (created.task as Record<string, unknown>).id as string

  const patched = await readJson(
    await app.request(`/api/oxana/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Новое название', dueAt }),
    }),
  )
  assert.equal((patched.task as Record<string, unknown>).title, 'Новое название')
  assert.equal((patched.task as Record<string, unknown>).dueAt, dueAt)

  const stolen = await app.request(`/api/oxana/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  assert.equal(stolen.status, 404)
})

test('deleting a project keeps tasks as personal', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const project = await readJson(
    await app.request('/api/oxana/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Временный проект' }),
    }),
  )
  const projectId = (project.project as Record<string, unknown>).id as string
  const task = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Останется личной', projectId }),
    }),
  )
  const taskId = (task.task as Record<string, unknown>).id as string

  const renamed = await readJson(
    await app.request(`/api/oxana/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Переименован', status: 'paused' }),
    }),
  )
  assert.equal((renamed.project as Record<string, unknown>).status, 'paused')

  const deleted = await app.request(`/api/oxana/projects/${projectId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(deleted.status, 200)

  const list = await readJson(
    await app.request('/api/oxana/tasks', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  const leftover = (list.tasks as Array<Record<string, unknown>>).find(
    (item) => item.id === taskId,
  )
  assert.equal(leftover?.projectId, null)
})

test('notifications stay inside the workspace and can be marked read', async () => {
  const repo = new MemoryOxanaRepo()
  const app = createApp({ oxanaRepo: repo })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)
  const status = await readJson(
    await app.request('/api/oxana/status', {
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  const workspaceId = (status.workspace as Record<string, unknown>).id as string
  const note = repo.addNotification(
    workspaceId,
    OWNER_A,
    'Срок задачи сегодня',
    `[[task:${OWNER_A}]]\nПроверить бриф`,
  )

  const listB = await readJson(
    await app.request('/api/oxana/notifications', {
      headers: { Authorization: `Bearer ${tokenB}` },
    }),
  )
  assert.equal((listB.notifications as unknown[]).length, 0)

  const stolen = await app.request(`/api/oxana/notifications/${note.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  assert.equal(stolen.status, 404)

  const marked = await readJson(
    await app.request(`/api/oxana/notifications/${note.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  assert.ok((marked.notification as Record<string, unknown>).readAt)

  const readAll = await readJson(
    await app.request('/api/oxana/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  assert.equal(readAll.ok, true)
})

test('settings and overview use workspace data without leaking foreign items', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)
  const dueAt = new Date(Date.now() + 60_000).toISOString()

  await app.request('/api/oxana/settings', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName: 'Оксана',
      timezone: 'Europe/Samara',
      dateFormat: 'date',
    }),
  })
  const settings = await readJson(
    await app.request('/api/oxana/settings', {
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  const saved = settings.settings as Record<string, unknown>
  assert.equal(saved.displayName, 'Оксана')
  assert.equal(saved.timezone, 'Europe/Samara')

  await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Сегодняшняя', dueAt }),
  })
  const overviewA = await readJson(
    await app.request('/api/oxana/overview', {
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  const overviewB = await readJson(
    await app.request('/api/oxana/overview', {
      headers: { Authorization: `Bearer ${tokenB}` },
    }),
  )
  assert.equal(overviewA.displayName, 'Оксана')
  assert.ok(((overviewA.todayTasks as unknown[]) ?? []).length >= 1)
  assert.equal((overviewB.todayTasks as unknown[]).length, 0)
})

test('rejects an event without a valid start time', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const response = await app.request('/api/oxana/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Без времени' }),
  })
  const body = await readJson(response)
  assert.equal(response.status, 400)
  assert.equal(body.error, 'invalid_starts_at')
})

test('persists cabinet migration fields and keeps them workspace-scoped', async () => {
  const repo = new MemoryOxanaRepo()
  const app = createApp({ oxanaRepo: repo })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)
  const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString()
  const dueAt = new Date(Date.now() + 3 * 86_400_000).toISOString()

  const project = await readJson(
    await app.request('/api/oxana/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'QA-проект кабинет',
        status: 'planned',
        startsAt,
        dueAt,
      }),
    }),
  )
  assert.equal(project.ok, true)
  const projectRow = project.project as Record<string, unknown>
  assert.equal(projectRow.status, 'planned')
  assert.equal(projectRow.startsAt, startsAt)
  assert.equal(projectRow.dueAt, dueAt)
  const projectId = projectRow.id as string

  const task = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'QA-задача срочная',
        priority: 'urgent',
        projectId,
        dueAt,
      }),
    }),
  )
  const taskRow = task.task as Record<string, unknown>
  assert.equal(taskRow.priority, 'urgent')
  assert.equal(taskRow.archivedAt, null)
  assert.equal(taskRow.projectId, projectId)
  const taskId = taskRow.id as string

  const archived = await readJson(
    await app.request(`/api/oxana/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ archivedAt: new Date().toISOString() }),
    }),
  )
  assert.ok((archived.task as Record<string, unknown>).archivedAt)

  const overviewWhileArchived = await readJson(
    await app.request('/api/oxana/overview', {
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  assert.equal((overviewWhileArchived.overdueTasks as unknown[]).length, 0)

  const restored = await readJson(
    await app.request(`/api/oxana/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ archivedAt: null, status: 'in_progress' }),
    }),
  )
  assert.equal((restored.task as Record<string, unknown>).archivedAt, null)
  assert.equal((restored.task as Record<string, unknown>).status, 'in_progress')

  const event = await readJson(
    await app.request('/api/oxana/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'QA-событие проекта',
        description: 'проверка связи',
        startsAt,
        projectId,
      }),
    }),
  )
  const eventRow = event.event as Record<string, unknown>
  assert.equal(eventRow.projectId, projectId)
  assert.equal(eventRow.projectTitle, 'QA-проект кабинет')
  assert.equal(eventRow.description, 'проверка связи')

  const stolen = await app.request(`/api/oxana/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ priority: 'low' }),
  })
  assert.equal(stolen.status, 404)

  const badPriority = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'QA-плохой приоритет', priority: 'critical' }),
  })
  assert.equal(badPriority.status, 400)
  const mediumPriority = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'QA-средний приоритет', priority: 'medium' }),
  })
  const mediumBody = await readJson(mediumPriority)
  assert.equal(mediumPriority.status, 400)
  assert.equal(mediumBody.error, 'invalid_priority')

  const note = repo.addNotification(
    ((
      await readJson(
        await app.request('/api/oxana/status', {
          headers: { Authorization: `Bearer ${tokenA}` },
        }),
      )
    ).workspace as Record<string, unknown>).id as string,
    OWNER_A,
    'Срок задачи сегодня',
    `[[task:${taskId}]]\nQA переход`,
    'task',
    taskId,
  )
  const notes = await readJson(
    await app.request('/api/oxana/notifications', {
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  const listed = (notes.notifications as Array<Record<string, unknown>>).find(
    (item) => item.id === note.id,
  )
  assert.equal(listed?.sourceType, 'task')
  assert.equal(listed?.sourceId, taskId)
})

test('health endpoint stays public and does not depend on the database', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const response = await app.request('/api/health')
  const body = await readJson(response)
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.service, 'oxana-pii-api')
  assert.equal('reminders' in body, false)
})

test('owner status exposes reminder scheduler diagnostics', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const response = await app.request('/api/oxana/status', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await readJson(response)
  const reminders = body.reminders as Record<string, unknown>
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(typeof reminders.enabled, 'boolean')
  assert.equal(typeof reminders.running, 'boolean')
  assert.ok(reminders.last_tick_at === null || typeof reminders.last_tick_at === 'string')
  assert.ok(
    reminders.last_tick_success === null ||
      typeof reminders.last_tick_success === 'boolean',
  )
  assert.ok(
    reminders.last_tick_error_code === null ||
      typeof reminders.last_tick_error_code === 'string',
  )

  const publicHealth = await readJson(await app.request('/api/health'))
  assert.equal('reminders' in publicHealth, false)

  const unauth = await app.request('/api/oxana/status')
  assert.equal(unauth.status, 401)
})

test('CA path ./certs/root.crt resolves from server root, not cwd', () => {
  const expected = path.resolve(SERVER_ROOT, 'certs', 'root.crt')
  const fromServerDir = resolveCaCertPath('./certs/root.crt')
  const previousCwd = process.cwd()
  process.chdir(os.tmpdir())
  try {
    const fromOtherCwd = resolveCaCertPath('./certs/root.crt')
    assert.equal(fromServerDir, expected)
    assert.equal(fromOtherCwd, expected)
    assert.equal(existsSync(fromOtherCwd), true)
  } finally {
    process.chdir(previousCwd)
  }
})

test('idempotent task create returns the same row after a lost response', async () => {
  class CountRepo extends MemoryOxanaRepo {
    creates = 0
    async createTask(
      workspaceId: string,
      userId: string,
      input: Parameters<MemoryOxanaRepo['createTask']>[2],
    ) {
      this.creates += 1
      return super.createTask(workspaceId, userId, input)
    }
  }
  const repo = new CountRepo()
  const app = createApp({ oxanaRepo: repo })
  const token = await signToken(OWNER_A)
  const key = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'
  const payload = {
    title: 'Проверить документы поставщика',
    priority: 'high',
    idempotencyKey: key,
  }
  const first = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const second = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const firstBody = await readJson(first)
  const secondBody = await readJson(second)
  assert.equal(first.status, 201)
  assert.equal(second.status, 200)
  assert.equal(repo.creates, 1)
  assert.equal(
    (firstBody.task as Record<string, unknown>).id,
    (secondBody.task as Record<string, unknown>).id,
  )
})

test('invalid idempotency key is rejected without a write', async () => {
  class CountRepo extends MemoryOxanaRepo {
    creates = 0
    async createTask(
      workspaceId: string,
      userId: string,
      input: Parameters<MemoryOxanaRepo['createTask']>[2],
    ) {
      this.creates += 1
      return super.createTask(workspaceId, userId, input)
    }
  }
  const repo = new CountRepo()
  const app = createApp({ oxanaRepo: repo })
  const token = await signToken(OWNER_A)
  const response = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Не должна создаться',
      idempotencyKey: 'not-a-uuid',
    }),
  })
  const body = await readJson(response)
  assert.equal(response.status, 400)
  assert.equal(body.error, 'invalid_idempotency_key')
  assert.equal(repo.creates, 0)
})

test('same idempotency key with different task content is rejected', async () => {
  class CountRepo extends MemoryOxanaRepo {
    creates = 0
    async createTask(
      workspaceId: string,
      userId: string,
      input: Parameters<MemoryOxanaRepo['createTask']>[2],
    ) {
      this.creates += 1
      return super.createTask(workspaceId, userId, input)
    }
  }
  const repo = new CountRepo()
  const app = createApp({ oxanaRepo: repo })
  const token = await signToken(OWNER_A)
  const key = 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2'
  const first = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Проверить документы поставщика',
      priority: 'high',
      idempotencyKey: key,
    }),
  })
  const second = await app.request('/api/oxana/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Другая задача',
      priority: 'low',
      idempotencyKey: key,
    }),
  })
  const firstBody = await readJson(first)
  const secondBody = await readJson(second)
  const listed = await app.request('/api/oxana/tasks', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const listedBody = await readJson(listed)
  assert.equal(first.status, 201)
  assert.equal(second.status, 409)
  assert.equal(secondBody.error, 'idempotency_key_conflict')
  assert.equal(repo.creates, 1)
  assert.equal((listedBody.tasks as unknown[]).length, 1)
  assert.equal(
    ((listedBody.tasks as Array<Record<string, unknown>>)[0] ?? {}).id,
    (firstBody.task as Record<string, unknown>).id,
  )
})

test('concurrent posts with the same idempotency key create one task', async () => {
  class CountRepo extends MemoryOxanaRepo {
    creates = 0
    async createTask(
      workspaceId: string,
      userId: string,
      input: Parameters<MemoryOxanaRepo['createTask']>[2],
    ) {
      this.creates += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return super.createTask(workspaceId, userId, input)
    }
  }
  const repo = new CountRepo()
  const app = createApp({ oxanaRepo: repo })
  const token = await signToken(OWNER_A)
  const payload = JSON.stringify({
    title: 'Одновременное создание',
    priority: 'normal',
    idempotencyKey: 'd3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3',
  })
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const [first, second] = await Promise.all([
    app.request('/api/oxana/tasks', { method: 'POST', headers, body: payload }),
    app.request('/api/oxana/tasks', { method: 'POST', headers, body: payload }),
  ])
  const firstBody = await readJson(first)
  const secondBody = await readJson(second)
  const listed = await readJson(
    await app.request('/api/oxana/tasks', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  assert.equal(repo.creates, 1)
  assert.equal((listed.tasks as unknown[]).length, 1)
  const ids = new Set([
    (firstBody.task as Record<string, unknown>).id,
    (secondBody.task as Record<string, unknown>).id,
  ])
  assert.equal(ids.size, 1)
  assert.equal([201, 200].includes(first.status), true)
  assert.equal([201, 200].includes(second.status), true)
})

test('propose-update is workspace-scoped and does not write', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const tokenA = await signToken(OWNER_A)
  const tokenB = await signToken(OWNER_B)
  const created = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Тест создания задачи ОКСИ', priority: 'normal' }),
    }),
  )
  const task = created.task as Record<string, unknown>
  const proposal = await app.request(`/api/oxana/tasks/${task.id}/propose-update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dueAt: '2026-11-13T20:59:00.000Z', priority: 'high' }),
  })
  const proposalBody = await readJson(proposal)
  assert.equal(proposal.status, 200)
  const card = proposalBody.proposal as Record<string, unknown>
  assert.equal(card.type, 'update_task')
  assert.deepEqual(card.fields, ['dueAt', 'priority'])
  const listed = await readJson(
    await app.request('/api/oxana/tasks', {
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
  )
  assert.equal((listed.tasks as Array<Record<string, unknown>>)[0]?.priority, 'normal')

  const stolen = await app.request(`/api/oxana/tasks/${task.id}/propose-update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ priority: 'high' }),
  })
  assert.equal(stolen.status, 404)
})

test('task patch with expectedUpdatedAt rejects stale writes including identical retries', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const created = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Тест создания задачи ОКСИ', priority: 'normal' }),
    }),
  )
  const task = created.task as Record<string, unknown>
  const first = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dueAt: '2026-11-13T20:59:00.000Z',
      priority: 'high',
      expectedUpdatedAt: task.updatedAt,
    }),
  })
  const firstBody = await readJson(first)
  assert.equal(first.status, 200)
  assert.equal((firstBody.task as Record<string, unknown>).priority, 'high')

  const replay = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dueAt: '2026-11-13T20:59:00.000Z',
      priority: 'high',
      expectedUpdatedAt: task.updatedAt,
    }),
  })
  const replayBody = await readJson(replay)
  assert.equal(replay.status, 409)
  assert.equal(replayBody.error, 'task_changed')
  assert.equal((firstBody.task as Record<string, unknown>).priority, 'high')

  const renamed = await readJson(
    await app.request(`/api/oxana/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Другое название' }),
    }),
  )
  const conflict = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priority: 'urgent',
      expectedUpdatedAt: (firstBody.task as Record<string, unknown>).updatedAt,
    }),
  })
  const conflictBody = await readJson(conflict)
  assert.equal(conflict.status, 409)
  assert.equal(conflictBody.error, 'task_changed')
  const current = await readJson(
    await app.request('/api/oxana/tasks', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  const currentTask = (current.tasks as Array<Record<string, unknown>>)[0]
  assert.equal(currentTask?.title, 'Другое название')
  assert.equal(currentTask?.priority, 'high')
  assert.equal(
    (renamed.task as Record<string, unknown>).title,
    'Другое название',
  )
})

test('priority-only patch keeps due, status, project and description', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const dueAt = '2026-11-13T20:59:00.000Z'
  const project = await readJson(
    await app.request('/api/oxana/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Кабинет ОКСИ' }),
    }),
  )
  const projectId = (project.project as Record<string, unknown>).id as string
  const created = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Только приоритет',
        description: 'не сбрасывать',
        dueAt,
        projectId,
        priority: 'normal',
      }),
    }),
  )
  const task = created.task as Record<string, unknown>
  const patched = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priority: 'high',
      expectedUpdatedAt: task.updatedAt,
    }),
  })
  const body = await readJson(patched)
  const next = body.task as Record<string, unknown>
  assert.equal(patched.status, 200)
  assert.equal(next.priority, 'high')
  assert.equal(next.dueAt, dueAt)
  assert.equal(next.description, 'не сбрасывать')
  assert.equal(next.status, 'open')
  assert.equal(next.projectId, projectId)
  assert.equal(next.title, 'Только приоритет')
})

test('due-only patch keeps title, status, project, priority and description', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const dueAt = '2026-11-13T20:59:00.000Z'
  const nextDue = '2026-11-20T20:59:00.000Z'
  const project = await readJson(
    await app.request('/api/oxana/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Кабинет ОКСИ' }),
    }),
  )
  const projectId = (project.project as Record<string, unknown>).id as string
  const created = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Только срок',
        description: 'не сбрасывать',
        dueAt,
        projectId,
        priority: 'high',
      }),
    }),
  )
  const task = created.task as Record<string, unknown>
  const patched = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dueAt: nextDue,
      expectedUpdatedAt: task.updatedAt,
    }),
  })
  const body = await readJson(patched)
  const next = body.task as Record<string, unknown>
  assert.equal(patched.status, 200)
  assert.equal(next.dueAt, nextDue)
  assert.equal(next.priority, 'high')
  assert.equal(next.description, 'не сбрасывать')
  assert.equal(next.status, 'open')
  assert.equal(next.projectId, projectId)
  assert.equal(next.title, 'Только срок')
})

test('stale proposal cannot apply a different patch after a later change', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const created = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Конфликт содержимого', priority: 'normal' }),
    }),
  )
  const task = created.task as Record<string, unknown>
  const first = await readJson(
    await app.request(`/api/oxana/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priority: 'high',
        expectedUpdatedAt: task.updatedAt,
      }),
    }),
  )
  const stale = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priority: 'urgent',
      expectedUpdatedAt: task.updatedAt,
    }),
  })
  const staleBody = await readJson(stale)
  assert.equal(stale.status, 409)
  assert.equal(staleBody.error, 'task_changed')
  assert.equal((first.task as Record<string, unknown>).priority, 'high')
})

test('identical stale patch after a later unrelated change is a conflict', async () => {
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const token = await signToken(OWNER_A)
  const created = await readJson(
    await app.request('/api/oxana/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Исходное имя', priority: 'normal' }),
    }),
  )
  const task = created.task as Record<string, unknown>
  const first = await readJson(
    await app.request(`/api/oxana/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priority: 'high',
        expectedUpdatedAt: task.updatedAt,
      }),
    }),
  )
  assert.equal(
    (
      await app.request(`/api/oxana/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Имя с вкладки Задачи' }),
      })
    ).status,
    200,
  )
  const staleIdentical = await app.request(`/api/oxana/tasks/${task.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priority: 'high',
      expectedUpdatedAt: task.updatedAt,
    }),
  })
  const staleBody = await readJson(staleIdentical)
  assert.equal(staleIdentical.status, 409)
  assert.equal(staleBody.error, 'task_changed')
  const listed = await readJson(
    await app.request('/api/oxana/tasks', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  const current = (listed.tasks as Array<Record<string, unknown>>)[0]
  assert.equal(current?.title, 'Имя с вкладки Задачи')
  assert.equal(current?.priority, 'high')
  assert.equal((first.task as Record<string, unknown>).priority, 'high')
})
