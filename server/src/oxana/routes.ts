import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { oxanaAiProvider, type OxanaAiProvider } from './aiAdapter.js'
import { runOxanaCabinetChat } from './aiOrchestrator.js'
import { parseOxanaChatHistory } from './chatHistory.js'
import { createRequireOxanaOwner } from './auth.js'
import { getOxanaReminderSchedulerStatus } from './reminderScheduler.js'
import { createConfiguredTokenVerifier, type TokenVerifier } from './tokenVerifier.js'
import { buildUpdateTaskProposal } from './aiProposeUpdate.js'
import {
  OxanaAiAuthError,
  OxanaAiNotConfiguredError,
  OxanaAiRateLimitError,
  OxanaAiUnavailableError,
  OxanaConflictError,
  OxanaDbUnavailableError,
  OxanaIdempotencyConflictError,
  OxanaNotFoundError,
} from './errors.js'
import {
  clampText,
  isUuid,
  parseEventCreate,
  parseEventPatch,
  parseProjectCreate,
  parseProjectPatch,
  parseSettingsPatch,
  parseExpectedUpdatedAt,
  parseTaskCreate,
  parseTaskPatch,
  parseTaskUpdateIntend,
} from './validation.js'
import type { OxanaRepository } from './types.js'

type OxanaEnv = {
  Variables: {
    userId: string
  }
}

function jsonError(error: unknown): {
  body: Record<string, unknown>
  status: ContentfulStatusCode
} {
  if (error instanceof OxanaDbUnavailableError) {
    return {
      status: 503,
      body: {
        ok: false,
        error: error.code,
        message: 'База ОКСИ недоступна. Запись не выполнена.',
      },
    }
  }
  if (error instanceof OxanaNotFoundError) {
    return { status: 404, body: { ok: false, error: error.code } }
  }
  if (error instanceof OxanaIdempotencyConflictError) {
    return {
      status: 409,
      body: {
        ok: false,
        error: error.code,
        message: 'Этот ключ уже использован для другой задачи.',
      },
    }
  }
  if (error instanceof OxanaConflictError) {
    return {
      status: 409,
      body: {
        ok: false,
        error: error.code,
        message: 'Задача изменилась. Обновите карточку, затем подтвердите снова.',
      },
    }
  }
  if (error instanceof OxanaAiNotConfiguredError) {
    return {
      status: 503,
      body: {
        ok: false,
        error: error.code,
        provider: 'gigachat',
        message: 'ИИ ОКСИ ещё не подключён. Ответ модели не создан.',
      },
    }
  }
  if (error instanceof OxanaAiAuthError) {
    return {
      status: 502,
      body: {
        ok: false,
        error: error.code,
        provider: 'gigachat',
        message: 'GigaChat отклонил авторизацию. Ответ модели не создан.',
      },
    }
  }
  if (error instanceof OxanaAiRateLimitError) {
    return {
      status: 429,
      body: {
        ok: false,
        error: error.code,
        provider: 'gigachat',
        message: 'Превышен лимит GigaChat. Ответ модели не создан.',
      },
    }
  }
  if (error instanceof OxanaAiUnavailableError) {
    return {
      status: 503,
      body: {
        ok: false,
        error: error.code,
        provider: 'gigachat',
        message: 'Сервис GigaChat недоступен. Ответ модели не создан.',
      },
    }
  }
  return { status: 500, body: { ok: false, error: 'server_error' } }
}

async function resolveWorkspace(repo: OxanaRepository, userId: string) {
  const workspace = await repo.ensureWorkspaceForUser(userId)
  return { userId, workspaceId: workspace.id, workspace }
}

function readIdempotencyKey(body: unknown): string | null | 'invalid' {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }
  const raw = clampText(
    (body as Record<string, unknown>).idempotencyKey,
    36,
  )
  if (!raw) {
    return null
  }
  return isUuid(raw) ? raw : 'invalid'
}

export function createOxanaRouter(
  repo: OxanaRepository,
  verifier: TokenVerifier = createConfiguredTokenVerifier(),
  ai: OxanaAiProvider = oxanaAiProvider,
) {
  const app = new Hono<OxanaEnv>()

  app.use('*', createRequireOxanaOwner(verifier))

  app.get('/status', async (c) => {
    try {
      const userId = c.get('userId')
      const { workspace } = await resolveWorkspace(repo, userId)
      return c.json({
        ok: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          kind: workspace.kind,
        },
        database: {
          connected: true,
        },
        api: {
          ready: true,
        },
        ai: {
          provider: ai.id,
          configured: ai.isConfigured(),
          ready: ai.isConfigured(),
        },
        channels: {
          telegram: false,
          max: false,
        },
        reminders: getOxanaReminderSchedulerStatus(),
      })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.get('/tasks', async (c) => {
    try {
      const { workspaceId } = await resolveWorkspace(repo, c.get('userId'))
      const tasks = await repo.listTasks(workspaceId)
      return c.json({ ok: true, tasks })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/tasks', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const parsed = parseTaskCreate(raw)
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }
    const idempotencyKey = readIdempotencyKey(raw)
    if (idempotencyKey === 'invalid') {
      return c.json({ ok: false, error: 'invalid_idempotency_key' }, 400)
    }
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const outcome = await repo.createTaskIdempotent(
        workspaceId,
        userId,
        parsed.data,
        idempotencyKey,
      )
      if (!outcome.replayed) {
        void repo
          .scheduleRemindersForTask(workspaceId, userId, outcome.task)
          .catch(() => undefined)
      }
      return c.json(
        { ok: true as const, task: outcome.task },
        outcome.replayed ? 200 : 201,
      )
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/tasks/:id/propose-update', async (c) => {
    const taskId = c.req.param('id')
    if (!isUuid(taskId)) {
      return c.json({ ok: false, error: 'invalid_task_id' }, 400)
    }
    const raw = await c.req.json().catch(() => null)
    const record =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {}
    const dueNeedsClarification = record.dueNeedsClarification === true
    const dueAmbiguousWeekday = clampText(record.dueAmbiguousWeekday, 40) || undefined
    const parsed = parseTaskUpdateIntend(raw)
    if (
      !parsed.ok &&
      !(dueNeedsClarification && parsed.error === 'validation_failed')
    ) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }
    const intend = parsed.ok ? parsed.data : {}
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const task = await repo.getTask(workspaceId, taskId)
      if (task.archivedAt) {
        throw new OxanaNotFoundError()
      }
      const settings = await repo.getSettings(workspaceId, userId)
      return c.json({
        ok: true,
        proposal: buildUpdateTaskProposal(task, intend, settings.timezone, {
          dueNeedsClarification,
          dueAmbiguousWeekday,
        }),
      })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.patch('/tasks/:id', async (c) => {
    const taskId = c.req.param('id')
    if (!isUuid(taskId)) {
      return c.json({ ok: false, error: 'invalid_task_id' }, 400)
    }
    const raw = await c.req.json().catch(() => null)
    const parsed = parseTaskPatch(raw)
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }
    const expected = parseExpectedUpdatedAt(raw)
    if (!expected.ok) {
      return c.json({ ok: false, error: expected.error }, 400)
    }
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const task = await repo.updateTask(workspaceId, taskId, parsed.data, {
        expectedUpdatedAt: expected.value,
      })
      void repo.scheduleRemindersForTask(workspaceId, userId, task).catch(() => undefined)
      return c.json({ ok: true, task })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.delete('/tasks/:id', async (c) => {
    const taskId = c.req.param('id')
    if (!isUuid(taskId)) {
      return c.json({ ok: false, error: 'invalid_task_id' }, 400)
    }
    try {
      const { workspaceId } = await resolveWorkspace(repo, c.get('userId'))
      await repo.deleteTask(workspaceId, taskId)
      return c.json({ ok: true })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.get('/overview', async (c) => {
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const overview = await repo.getOverview(workspaceId, userId)
      return c.json({ ok: true, ...overview })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.get('/settings', async (c) => {
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const settings = await repo.getSettings(workspaceId, userId)
      return c.json({ ok: true, settings })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.patch('/settings', async (c) => {
    const parsed = parseSettingsPatch(await c.req.json().catch(() => null))
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const settings = await repo.updateSettings(workspaceId, userId, parsed.data)
      return c.json({ ok: true, settings })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.get('/projects', async (c) => {
    try {
      const { workspaceId } = await resolveWorkspace(repo, c.get('userId'))
      const projects = await repo.listProjects(workspaceId)
      return c.json({ ok: true, projects })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.get('/projects/:id', async (c) => {
    const projectId = c.req.param('id')
    if (!isUuid(projectId)) {
      return c.json({ ok: false, error: 'invalid_project_id' }, 400)
    }
    try {
      const { workspaceId } = await resolveWorkspace(repo, c.get('userId'))
      const payload = await repo.getProjectWithTasks(workspaceId, projectId)
      return c.json({ ok: true, ...payload })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/projects', async (c) => {
    const parsed = parseProjectCreate(await c.req.json().catch(() => null))
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const project = await repo.createProject(workspaceId, userId, parsed.data)
      return c.json({ ok: true, project }, 201)
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.patch('/projects/:id', async (c) => {
    const projectId = c.req.param('id')
    if (!isUuid(projectId)) {
      return c.json({ ok: false, error: 'invalid_project_id' }, 400)
    }
    const parsed = parseProjectPatch(await c.req.json().catch(() => null))
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }
    try {
      const { workspaceId } = await resolveWorkspace(repo, c.get('userId'))
      const project = await repo.updateProject(workspaceId, projectId, parsed.data)
      return c.json({ ok: true, project })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.delete('/projects/:id', async (c) => {
    const projectId = c.req.param('id')
    if (!isUuid(projectId)) {
      return c.json({ ok: false, error: 'invalid_project_id' }, 400)
    }
    try {
      const { workspaceId } = await resolveWorkspace(repo, c.get('userId'))
      await repo.deleteProject(workspaceId, projectId)
      return c.json({ ok: true })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.get('/events', async (c) => {
    try {
      const { workspaceId } = await resolveWorkspace(repo, c.get('userId'))
      const events = await repo.listEvents(workspaceId)
      return c.json({ ok: true, events })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/events', async (c) => {
    const parsed = parseEventCreate(await c.req.json().catch(() => null))
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const event = await repo.createEvent(workspaceId, userId, parsed.data)
      void repo
        .scheduleRemindersForEvent(workspaceId, userId, event)
        .catch(() => undefined)
      return c.json({ ok: true, event }, 201)
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.patch('/events/:id', async (c) => {
    const eventId = c.req.param('id')
    if (!isUuid(eventId)) {
      return c.json({ ok: false, error: 'invalid_event_id' }, 400)
    }
    const parsed = parseEventPatch(await c.req.json().catch(() => null))
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const event = await repo.updateEvent(workspaceId, eventId, parsed.data)
      void repo
        .scheduleRemindersForEvent(workspaceId, userId, event)
        .catch(() => undefined)
      return c.json({ ok: true, event })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.delete('/events/:id', async (c) => {
    const eventId = c.req.param('id')
    if (!isUuid(eventId)) {
      return c.json({ ok: false, error: 'invalid_event_id' }, 400)
    }
    try {
      const { workspaceId } = await resolveWorkspace(repo, c.get('userId'))
      await repo.deleteEvent(workspaceId, eventId)
      return c.json({ ok: true })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.get('/notifications', async (c) => {
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const notifications = await repo.listNotifications(workspaceId, userId)
      return c.json({ ok: true, notifications })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.patch('/notifications/:id', async (c) => {
    const notificationId = c.req.param('id')
    if (!isUuid(notificationId)) {
      return c.json({ ok: false, error: 'invalid_notification_id' }, 400)
    }
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const notification = await repo.markNotificationRead(
        workspaceId,
        userId,
        notificationId,
      )
      return c.json({ ok: true, notification })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/notifications/read-all', async (c) => {
    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const updated = await repo.markAllNotificationsRead(workspaceId, userId)
      return c.json({ ok: true, updated })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/chat', async (c) => {
    const body = await c.req.json().catch(() => null)
    const record =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null
    const message = String(record?.message ?? '').trim()
    if (!message) {
      return c.json({ ok: false, error: 'message_required' }, 400)
    }
    if (message.length > 4000) {
      return c.json({ ok: false, error: 'message_too_long' }, 400)
    }
    const history = parseOxanaChatHistory(record?.history)

    try {
      const { userId, workspaceId } = await resolveWorkspace(
        repo,
        c.get('userId'),
      )
      const result = await runOxanaCabinetChat({
        ai,
        repo,
        userId,
        workspaceId,
        message,
        history,
      })
      return c.json({
        ok: true,
        provider: ai.id,
        reply: result.reply,
        ...(result.proposal ? { proposal: result.proposal } : {}),
      })
    } catch (error) {
      const mapped = jsonError(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  return app
}
