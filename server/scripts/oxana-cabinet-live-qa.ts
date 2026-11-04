import { SignJWT } from 'jose'
import { getOxanaPool } from '../src/oxana/db.js'
import { processDueReminderJobs } from '../src/oxana/reminderScheduler.js'

const API = 'http://127.0.0.1:8787'
const PREFIX = 'QA-ОКСИ-20261104'

type Result = { name: string; ok: boolean; detail: string }

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name}_missing`)
  }
  return value
}

async function signOwnerToken(): Promise<string> {
  const secret = requireEnv('SUPABASE_JWT_SECRET')
  const userId = requireEnv('OXANA_ALLOWED_USER_IDS').split(',')[0].trim()
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(new TextEncoder().encode(secret))
}

async function request(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  let body: Record<string, unknown> = {}
  try {
    body = (await response.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: response.status, body }
}

function record(results: Result[], name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail })
}

async function cleanup(
  token: string,
  ids: {
    taskIds: string[]
    projectIds: string[]
    eventIds: string[]
    notificationIds: string[]
  },
) {
  for (const eventId of ids.eventIds) {
    await request(token, `/api/oxana/events/${eventId}`, { method: 'DELETE' })
  }
  for (const projectId of ids.projectIds) {
    await request(token, `/api/oxana/projects/${projectId}`, { method: 'DELETE' })
  }
  for (const taskId of ids.taskIds) {
    await request(token, `/api/oxana/tasks/${taskId}`, { method: 'DELETE' })
  }
  if (!ids.notificationIds.length && !ids.taskIds.length && !ids.eventIds.length) {
    return
  }
  const pool = getOxanaPool()
  if (ids.notificationIds.length) {
    await pool.query(
      `delete from oxana.notifications where id = any($1::uuid[])`,
      [ids.notificationIds],
    )
  }
  const keys = [...ids.taskIds, ...ids.eventIds]
  if (keys.length) {
    await pool.query(
      `delete from oxana.jobs
       where kind = 'reminder'
         and (
           ${keys.map((_, index) => `idempotency_key like '%' || $${index + 1} || '%'`).join(' or ')}
         )`,
      keys,
    )
  }
}

async function main() {
  const results: Result[] = []
  const token = await signOwnerToken()
  const created = {
    taskIds: [] as string[],
    projectIds: [] as string[],
    eventIds: [] as string[],
    notificationIds: [] as string[],
  }

  const health = await fetch(`${API}/api/health`)
  const healthBody = (await health.json()) as Record<string, unknown>
  record(
    results,
    'health',
    health.ok && healthBody.ok === true,
    `status=${health.status}`,
  )

  const status = await request(token, '/api/oxana/status')
  record(
    results,
    'status_ready',
    status.status === 200 &&
      Boolean((status.body.database as { connected?: boolean } | undefined)?.connected) &&
      Boolean((status.body.api as { ready?: boolean } | undefined)?.ready),
    `http=${status.status} error=${String(status.body.error ?? '')}`,
  )
  if (status.status !== 200) {
    console.log(JSON.stringify({ results }, null, 2))
    process.exit(1)
  }

  const beforeTasks = await request(token, '/api/oxana/tasks')
  const beforeProjects = await request(token, '/api/oxana/projects')
  const beforeEvents = await request(token, '/api/oxana/events')
  const beforeNotes = await request(token, '/api/oxana/notifications')
  const protectedTitles = new Set(
    [
      ...(((beforeTasks.body.tasks as Array<{ title?: string }>) ?? []).map((item) => item.title)),
      ...(((beforeProjects.body.projects as Array<{ title?: string }>) ?? []).map((item) => item.title)),
      ...(((beforeEvents.body.events as Array<{ title?: string }>) ?? []).map((item) => item.title)),
    ].filter(Boolean) as string[],
  )

  const projectStarts = '2026-11-10T07:00:00.000Z'
  const projectDue = '2026-11-20T15:00:00.000Z'
  const createdProject = await request(token, '/api/oxana/projects', {
    method: 'POST',
    body: JSON.stringify({
      title: `${PREFIX} проект`,
      description: 'изолированная проверка кабинета',
      status: 'planned',
      startsAt: projectStarts,
      dueAt: projectDue,
    }),
  })
  const project = createdProject.body.project as Record<string, unknown> | undefined
  if (project?.id) created.projectIds.push(String(project.id))
  record(
    results,
    'project_create_planned',
    createdProject.status === 201 &&
      project?.status === 'planned' &&
      project?.startsAt === projectStarts &&
      project?.dueAt === projectDue,
    `http=${createdProject.status} status=${String(project?.status ?? '')}`,
  )

  const taskDue = '2026-11-04T20:50:00.000Z'
  const createdTask = await request(token, '/api/oxana/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: `${PREFIX} задача`,
      description: 'проверка приоритета и проекта',
      priority: 'urgent',
      projectId: project?.id,
      dueAt: taskDue,
    }),
  })
  const task = createdTask.body.task as Record<string, unknown> | undefined
  if (task?.id) created.taskIds.push(String(task.id))
  record(
    results,
    'task_create_priority_project_due',
    createdTask.status === 201 &&
      task?.priority === 'urgent' &&
      task?.projectId === project?.id &&
      task?.dueAt === taskDue,
    `http=${createdTask.status} priority=${String(task?.priority ?? '')}`,
  )

  for (const statusValue of ['open', 'in_progress', 'done', 'cancelled'] as const) {
    const patched = await request(token, `/api/oxana/tasks/${task?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: statusValue }),
    })
    const row = patched.body.task as Record<string, unknown> | undefined
    record(
      results,
      `task_status_${statusValue}`,
      patched.status === 200 && row?.status === statusValue,
      `http=${patched.status}`,
    )
  }

  const edited = await request(token, `/api/oxana/tasks/${task?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: `${PREFIX} задача правки`,
      priority: 'high',
      status: 'in_progress',
    }),
  })
  record(
    results,
    'task_edit',
    edited.status === 200 &&
      (edited.body.task as Record<string, unknown> | undefined)?.priority === 'high',
    `http=${edited.status}`,
  )

  const archived = await request(token, `/api/oxana/tasks/${task?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ archivedAt: new Date().toISOString() }),
  })
  record(
    results,
    'task_archive',
    archived.status === 200 &&
      Boolean((archived.body.task as Record<string, unknown> | undefined)?.archivedAt),
    `http=${archived.status}`,
  )
  const restored = await request(token, `/api/oxana/tasks/${task?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ archivedAt: null }),
  })
  record(
    results,
    'task_restore',
    restored.status === 200 &&
      (restored.body.task as Record<string, unknown> | undefined)?.archivedAt === null,
    `http=${restored.status}`,
  )

  const listedTasks = await request(token, '/api/oxana/tasks')
  const foundTask = ((listedTasks.body.tasks as Array<Record<string, unknown>>) ?? []).find(
    (item) => item.id === task?.id,
  )
  record(
    results,
    'task_persist_reload',
    foundTask?.title === `${PREFIX} задача правки` && foundTask?.priority === 'high',
    `found=${Boolean(foundTask)}`,
  )

  const projectCard = await request(token, `/api/oxana/projects/${project?.id}`)
  record(
    results,
    'project_linked_tasks',
    projectCard.status === 200 &&
      ((projectCard.body.tasks as unknown[]) ?? []).length === 1,
    `http=${projectCard.status} tasks=${((projectCard.body.tasks as unknown[]) ?? []).length}`,
  )

  const projectEdit = await request(token, `/api/oxana/projects/${project?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'active', title: `${PREFIX} проект правки` }),
  })
  record(
    results,
    'project_edit_status',
    projectEdit.status === 200 &&
      (projectEdit.body.project as Record<string, unknown> | undefined)?.status === 'active',
    `http=${projectEdit.status}`,
  )

  const eventStart = '2026-11-04T18:45:00.000Z'
  const createdEvent = await request(token, '/api/oxana/events', {
    method: 'POST',
    body: JSON.stringify({
      title: `${PREFIX} событие`,
      description: 'календарь и проект',
      startsAt: eventStart,
      projectId: project?.id,
    }),
  })
  const event = createdEvent.body.event as Record<string, unknown> | undefined
  if (event?.id) created.eventIds.push(String(event.id))
  record(
    results,
    'event_create_moscow_project',
    createdEvent.status === 201 &&
      event?.startsAt === eventStart &&
      event?.projectId === project?.id &&
      eventStart === '2026-11-04T18:45:00.000Z',
    `http=${createdEvent.status} startsAt=${String(event?.startsAt ?? '')}`,
  )

  const eventEdit = await request(token, `/api/oxana/events/${event?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: `${PREFIX} событие правки` }),
  })
  record(
    results,
    'event_edit',
    eventEdit.status === 200 &&
      (eventEdit.body.event as Record<string, unknown> | undefined)?.title ===
        `${PREFIX} событие правки`,
    `http=${eventEdit.status}`,
  )

  const eventsList = await request(token, '/api/oxana/events')
  record(
    results,
    'event_persist_reload',
    ((eventsList.body.events as Array<Record<string, unknown>>) ?? []).some(
      (item) => item.id === event?.id && item.projectId === project?.id,
    ),
    `http=${eventsList.status}`,
  )

  const settingsBefore = await request(token, '/api/oxana/settings')
  const previousName = String(
    (settingsBefore.body.settings as Record<string, unknown> | undefined)?.displayName ?? '',
  )
  const settingsSave = await request(token, '/api/oxana/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      timezone: 'Europe/Moscow',
      dateFormat: 'datetime',
      notifyTaskOverdue: true,
      displayName: previousName,
    }),
  })
  record(
    results,
    'settings_save',
    settingsSave.status === 200 &&
      (settingsSave.body.settings as Record<string, unknown> | undefined)?.timezone ===
        'Europe/Moscow',
    `http=${settingsSave.status}`,
  )

  const overdueDue = new Date(Date.now() - 10_000).toISOString()
  const reminderTask = await request(token, '/api/oxana/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: `${PREFIX} напоминание`,
      priority: 'low',
      dueAt: overdueDue,
    }),
  })
  const reminderRow = reminderTask.body.task as Record<string, unknown> | undefined
  if (reminderRow?.id) created.taskIds.push(String(reminderRow.id))
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const firstTick = await processDueReminderJobs()
  const secondTick = await processDueReminderJobs()
  const notes = await request(token, '/api/oxana/notifications')
  const reminderNotes = ((notes.body.notifications as Array<Record<string, unknown>>) ?? []).filter(
    (item) =>
      String(item.body ?? '').includes(String(reminderRow?.id ?? 'missing')) ||
      item.sourceId === reminderRow?.id,
  )
  for (const item of reminderNotes) {
    created.notificationIds.push(String(item.id))
  }
  record(
    results,
    'notifications_reminder_no_dup',
    reminderNotes.length === 1 && secondTick >= 0,
    `notes=${reminderNotes.length} ticks=${firstTick}/${secondTick}`,
  )

  if (reminderNotes[0]?.id) {
    const marked = await request(
      token,
      `/api/oxana/notifications/${reminderNotes[0].id}`,
      { method: 'PATCH' },
    )
    record(
      results,
      'notification_mark_read',
      marked.status === 200 &&
        Boolean((marked.body.notification as Record<string, unknown> | undefined)?.readAt),
      `http=${marked.status}`,
    )
    record(
      results,
      'notification_source_link',
      (marked.body.notification as Record<string, unknown> | undefined)?.sourceType === 'task' &&
        (marked.body.notification as Record<string, unknown> | undefined)?.sourceId ===
          reminderRow?.id,
      `source=${String((marked.body.notification as Record<string, unknown> | undefined)?.sourceType ?? '')}`,
    )
  } else {
    record(results, 'notification_mark_read', false, 'reminder_missing')
    record(results, 'notification_source_link', false, 'reminder_missing')
  }

  const overview = await request(token, '/api/oxana/overview')
  record(
    results,
    'overview_counters',
    overview.status === 200 &&
      typeof overview.body.completionPercent === 'number' &&
      typeof overview.body.unreadCount === 'number',
    `http=${overview.status} completion=${String(overview.body.completionPercent ?? '')}`,
  )

  const deletedProject = await request(token, `/api/oxana/projects/${project?.id}`, {
    method: 'DELETE',
  })
  const tasksAfterDelete = await request(token, '/api/oxana/tasks')
  const leftover = ((tasksAfterDelete.body.tasks as Array<Record<string, unknown>>) ?? []).find(
    (item) => item.id === task?.id,
  )
  record(
    results,
    'project_delete_keeps_tasks',
    deletedProject.status === 200 && leftover?.projectId === null,
    `http=${deletedProject.status} projectId=${String(leftover?.projectId)}`,
  )
  created.projectIds = created.projectIds.filter((id) => id !== project?.id)

  const invalid = await request(token, '/api/oxana/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: `${PREFIX} bad`, priority: 'critical' }),
  })
  record(
    results,
    'api_error_invalid_priority',
    invalid.status === 400 && invalid.body.error === 'invalid_priority',
    `http=${invalid.status}`,
  )

  const unauthorized = await fetch(`${API}/api/oxana/tasks`)
  record(results, 'security_no_token', unauthorized.status === 401, `http=${unauthorized.status}`)

  await cleanup(token, created)

  const afterTasks = await request(token, '/api/oxana/tasks')
  const afterProjects = await request(token, '/api/oxana/projects')
  const afterEvents = await request(token, '/api/oxana/events')
  const afterNotes = await request(token, '/api/oxana/notifications')
  const leftoverQa = [
    ...(((afterTasks.body.tasks as Array<{ title?: string }>) ?? [])),
    ...(((afterProjects.body.projects as Array<{ title?: string }>) ?? [])),
    ...(((afterEvents.body.events as Array<{ title?: string }>) ?? [])),
  ].filter((item) => String(item.title ?? '').startsWith(PREFIX))
  const protectedStillThere = [...protectedTitles].every((title) =>
    [
      ...(((afterTasks.body.tasks as Array<{ title?: string }>) ?? []).map((item) => item.title)),
      ...(((afterProjects.body.projects as Array<{ title?: string }>) ?? []).map((item) => item.title)),
      ...(((afterEvents.body.events as Array<{ title?: string }>) ?? []).map((item) => item.title)),
    ].includes(title),
  )
  record(
    results,
    'cleanup_isolated',
    leftoverQa.length === 0 && protectedStillThere,
    `qaLeft=${leftoverQa.length} protected=${protectedStillThere} notes=${((afterNotes.body.notifications as unknown[]) ?? []).length - ((beforeNotes.body.notifications as unknown[]) ?? []).length}`,
  )

  const failed = results.filter((item) => !item.ok)
  console.log(
    JSON.stringify(
      {
        passed: results.filter((item) => item.ok).length,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
  )
  process.exit(failed.length ? 1 : 0)
}

main().catch((error: unknown) => {
  console.log(
    JSON.stringify(
      {
        passed: 0,
        failed: 1,
        results: [
          {
            name: 'live_qa_crash',
            ok: false,
            detail: error instanceof Error ? error.message : 'unknown',
          },
        ],
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
