import type { PoolClient } from 'pg'
import {
  OxanaDbUnavailableError,
  OxanaIdempotencyConflictError,
  OxanaNotFoundError,
} from './errors.js'
import { hashTaskCreateInput } from './idempotency.js'
import { getOxanaPool, isOxanaDatabaseConfigured } from './db.js'
import type {
  CreateEventInput,
  CreateProjectInput,
  CreateTaskInput,
  OxanaEvent,
  OxanaNotification,
  OxanaOwnerSettings,
  OxanaOverview,
  OxanaProject,
  OxanaProjectWithTasks,
  OxanaRepository,
  OxanaTask,
  OxanaWorkspace,
  UpdateEventInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from './types.js'
import { isReminderRunAtTooOld } from './reminderPolicy.js'
import { DEFAULT_OWNER_SETTINGS, mergeSettings } from './settingsDefaults.js'
import { startOfDay } from './time.js'
import { parseNotificationSource } from './validation.js'
import { safeErrorCode, safeErrorName } from '../safeLog.js'

const TASK_SELECT = `t.id, t.workspace_id, t.project_id, t.title, t.description, t.status,
                t.priority, t.due_at, t.archived_at, t.created_by, t.created_at, t.updated_at,
                p.title as project_title`

const EVENT_SELECT = `e.id, e.workspace_id, e.title, e.description, e.starts_at, e.ends_at,
                e.remind_at, e.project_id, e.created_by, e.created_at,
                p.title as project_title`

const NOTIFICATION_SELECT = `id, workspace_id, user_id, title, body, channel,
                source_type, source_id, read_at, created_at`

function mapTask(row: Record<string, unknown>): OxanaTask {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: row.project_id ? String(row.project_id) : null,
    projectTitle: row.project_title ? String(row.project_title) : null,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    status: row.status as OxanaTask['status'],
    priority: (row.priority as OxanaTask['priority']) || 'normal',
    dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
    archivedAt: row.archived_at
      ? new Date(String(row.archived_at)).toISOString()
      : null,
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function mapProject(row: Record<string, unknown>): OxanaProject {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    status: row.status as OxanaProject['status'],
    startsAt: row.starts_at ? new Date(String(row.starts_at)).toISOString() : null,
    dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    taskCount: Number(row.task_count ?? 0),
    doneCount: Number(row.done_count ?? 0),
    overdueCount: Number(row.overdue_count ?? 0),
  }
}

function mapEvent(row: Record<string, unknown>): OxanaEvent {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    startsAt: new Date(String(row.starts_at)).toISOString(),
    endsAt: row.ends_at ? new Date(String(row.ends_at)).toISOString() : null,
    remindAt: row.remind_at ? new Date(String(row.remind_at)).toISOString() : null,
    projectId: row.project_id ? String(row.project_id) : null,
    projectTitle: row.project_title ? String(row.project_title) : null,
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

function mapNotification(row: Record<string, unknown>): OxanaNotification {
  const body = row.body ? String(row.body) : null
  const parsed = parseNotificationSource(body)
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    title: String(row.title),
    body,
    channel: row.channel as OxanaNotification['channel'],
    sourceType:
      (row.source_type as OxanaNotification['sourceType']) ||
      parsed?.sourceType ||
      null,
    sourceId: row.source_id ? String(row.source_id) : parsed?.sourceId || null,
    readAt: row.read_at ? new Date(String(row.read_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

const PROJECT_SELECT = `p.id, p.workspace_id, p.title, p.description, p.status,
         p.starts_at, p.due_at, p.created_by, p.created_at, p.updated_at,
         (select count(*) from oxana.tasks t
           where t.project_id = p.id and t.archived_at is null) as task_count,
         (select count(*) from oxana.tasks t
           where t.project_id = p.id and t.status = 'done' and t.archived_at is null) as done_count,
         (select count(*) from oxana.tasks t
           where t.project_id = p.id
             and t.archived_at is null
             and t.due_at is not null
             and t.due_at < now()
             and t.status in ('open', 'in_progress')) as overdue_count`

function isTaskCreateKeyConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = 'code' in error ? String(error.code) : ''
  if (code !== '23505') {
    return false
  }
  const constraint = 'constraint' in error ? String(error.constraint) : ''
  return (
    constraint === 'oxana_task_create_keys_pkey' ||
    constraint.includes('task_create_keys')
  )
}

function wrapDbError(error: unknown): never {
  if (
    error instanceof OxanaDbUnavailableError ||
    error instanceof OxanaNotFoundError ||
    error instanceof OxanaIdempotencyConflictError
  ) {
    throw error
  }
  console.error(
    JSON.stringify({
      event: 'oxana_db_error',
      name: safeErrorName(error),
      code: safeErrorCode(error),
    }),
  )
  throw new OxanaDbUnavailableError()
}

export class PgOxanaRepo implements OxanaRepository {
  private requirePool() {
    if (!isOxanaDatabaseConfigured()) {
      throw new OxanaDbUnavailableError()
    }
    return getOxanaPool()
  }

  async ensureWorkspaceForUser(userId: string): Promise<OxanaWorkspace> {
    const pool = this.requirePool()
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw new OxanaDbUnavailableError()
    }
    try {
      await client.query('begin')
      const existing = await client.query(
        `select w.id, w.slug, w.name, w.kind
         from oxana.workspace_members m
         join oxana.workspaces w on w.id = m.workspace_id
         where m.user_id = $1
           and w.kind = 'owner'
         order by w.created_at asc
         limit 1`,
        [userId],
      )
      if (existing.rows[0]) {
        await client.query('commit')
        return existing.rows[0] as OxanaWorkspace
      }

      await client.query(
        `insert into oxana.identities (user_id)
         values ($1)
         on conflict (user_id) do nothing`,
        [userId],
      )

      const created = await client.query(
        `insert into oxana.workspaces (slug, name, kind)
         values ($1, 'OXANA', 'owner')
         on conflict (slug) do update set name = oxana.workspaces.name
         returning id, slug, name, kind`,
        [`owner-${userId}`],
      )
      const workspace = created.rows[0] as OxanaWorkspace
      await client.query(
        `insert into oxana.workspace_members (workspace_id, user_id, role)
         values ($1, $2, 'owner')
         on conflict do nothing`,
        [workspace.id, userId],
      )
      await client.query(
        `insert into oxana.ai_settings (workspace_id)
         values ($1)
         on conflict do nothing`,
        [workspace.id],
      )
      await client.query('commit')
      return workspace
    } catch (error) {
      try {
        await client.query('rollback')
      } catch {
        // keep original error
      }
      wrapDbError(error)
    } finally {
      client.release()
    }
  }

  async listTasks(workspaceId: string): Promise<OxanaTask[]> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `select ${TASK_SELECT}
         from oxana.tasks t
         left join oxana.projects p
           on p.id = t.project_id and p.workspace_id = t.workspace_id
         where t.workspace_id = $1
         order by t.created_at desc`,
        [workspaceId],
      )
      return result.rows.map((row) => mapTask(row as Record<string, unknown>))
    } catch (error) {
      wrapDbError(error)
    }
  }

  private async insertTaskRow(
    queryable: PoolClient | ReturnType<PgOxanaRepo['requirePool']>,
    workspaceId: string,
    userId: string,
    input: CreateTaskInput,
  ): Promise<string> {
    if (input.projectId) {
      const project = await queryable.query(
        `select id from oxana.projects
         where id = $1 and workspace_id = $2`,
        [input.projectId, workspaceId],
      )
      if (!project.rows[0]) {
        throw new OxanaNotFoundError()
      }
    }

    // PostgreSQL does not expose a modifying CTE to a later SELECT on the
    // same table in one statement. Read the row in a second query instead.
    const result = await queryable.query<{ id: string }>(
      `insert into oxana.tasks (
         workspace_id, project_id, title, description, created_by, due_at, priority
       ) values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        workspaceId,
        input.projectId,
        input.title,
        input.description,
        userId,
        input.dueAt,
        input.priority,
      ],
    )
    if (!result.rows[0]) {
      throw new OxanaDbUnavailableError()
    }
    return result.rows[0].id
  }

  private async readTaskRow(
    queryable: PoolClient | ReturnType<PgOxanaRepo['requirePool']>,
    workspaceId: string,
    taskId: string,
  ): Promise<OxanaTask> {
    const result = await queryable.query(
      `select ${TASK_SELECT}
       from oxana.tasks t
       left join oxana.projects p
         on p.id = t.project_id and p.workspace_id = t.workspace_id
       where t.workspace_id = $1 and t.id = $2`,
      [workspaceId, taskId],
    )
    if (!result.rows[0]) {
      throw new OxanaNotFoundError()
    }
    return mapTask(result.rows[0] as Record<string, unknown>)
  }

  async createTask(
    workspaceId: string,
    userId: string,
    input: CreateTaskInput,
  ): Promise<OxanaTask> {
    const pool = this.requirePool()
    try {
      const taskId = await this.insertTaskRow(pool, workspaceId, userId, input)
      return this.readTaskRow(pool, workspaceId, taskId)
    } catch (error) {
      wrapDbError(error)
    }
  }

  async createTaskIdempotent(
    workspaceId: string,
    userId: string,
    input: CreateTaskInput,
    idempotencyKey: string | null,
  ): Promise<{ task: OxanaTask; replayed: boolean }> {
    if (!idempotencyKey) {
      return {
        task: await this.createTask(workspaceId, userId, input),
        replayed: false,
      }
    }

    const requestHash = hashTaskCreateInput(input)
    const pool = this.requirePool()
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw new OxanaDbUnavailableError()
    }

    try {
      await client.query('begin')
      try {
        const taskId = await this.insertTaskRow(
          client,
          workspaceId,
          userId,
          input,
        )
        await client.query(
          `insert into oxana.task_create_keys (
             user_id, idempotency_key, workspace_id, request_hash, task_id
           ) values ($1, $2, $3, $4, $5)`,
          [userId, idempotencyKey, workspaceId, requestHash, taskId],
        )
        const task = await this.readTaskRow(client, workspaceId, taskId)
        await client.query('commit')
        return { task, replayed: false }
      } catch (error) {
        try {
          await client.query('rollback')
        } catch {
          // keep original error
        }
        if (isTaskCreateKeyConflict(error)) {
          return this.replayTaskCreate(
            workspaceId,
            userId,
            idempotencyKey,
            requestHash,
          )
        }
        wrapDbError(error)
      }
    } finally {
      client.release()
    }
  }

  private async replayTaskCreate(
    workspaceId: string,
    userId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<{ task: OxanaTask; replayed: boolean }> {
    const pool = this.requirePool()
    try {
      const existing = await pool.query<{
        request_hash: string
        task_id: string | null
        workspace_id: string
      }>(
        `select request_hash, task_id, workspace_id
         from oxana.task_create_keys
         where user_id = $1 and idempotency_key = $2`,
        [userId, idempotencyKey],
      )
      const row = existing.rows[0]
      if (!row) {
        throw new OxanaDbUnavailableError()
      }
      if (
        row.request_hash !== requestHash ||
        row.workspace_id !== workspaceId ||
        !row.task_id
      ) {
        throw new OxanaIdempotencyConflictError()
      }
      const task = await this.readTaskRow(pool, workspaceId, row.task_id)
      return { task, replayed: true }
    } catch (error) {
      wrapDbError(error)
    }
  }

  async updateTask(
    workspaceId: string,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<OxanaTask> {
    const pool = this.requirePool()
    try {
      if (input.projectId) {
        const project = await pool.query(
          `select id from oxana.projects
           where id = $1 and workspace_id = $2`,
          [input.projectId, workspaceId],
        )
        if (!project.rows[0]) {
          throw new OxanaNotFoundError()
        }
      }

      const sets = ['updated_at = now()']
      const values: unknown[] = [taskId, workspaceId]
      if (input.status !== undefined) {
        values.push(input.status)
        sets.push(`status = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'projectId')) {
        values.push(input.projectId ?? null)
        sets.push(`project_id = $${values.length}`)
      }
      if (input.title !== undefined) {
        values.push(input.title)
        sets.push(`title = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'description')) {
        values.push(input.description ?? null)
        sets.push(`description = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'dueAt')) {
        values.push(input.dueAt ?? null)
        sets.push(`due_at = $${values.length}`)
      }
      if (input.priority !== undefined) {
        values.push(input.priority)
        sets.push(`priority = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'archivedAt')) {
        values.push(input.archivedAt ?? null)
        sets.push(`archived_at = $${values.length}`)
      }

      const result = await pool.query<{ id: string }>(
        `update oxana.tasks
         set ${sets.join(', ')}
         where id = $1 and workspace_id = $2
         returning id`,
        values,
      )
      if (!result.rows[0]) {
        throw new OxanaNotFoundError()
      }
      return this.getTask(workspaceId, result.rows[0].id)
    } catch (error) {
      wrapDbError(error)
    }
  }

  async listProjects(workspaceId: string): Promise<OxanaProject[]> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `select ${PROJECT_SELECT}
         from oxana.projects p
         where p.workspace_id = $1
         order by p.created_at desc`,
        [workspaceId],
      )
      return result.rows.map((row) =>
        mapProject(row as Record<string, unknown>),
      )
    } catch (error) {
      wrapDbError(error)
    }
  }

  async getProjectWithTasks(
    workspaceId: string,
    projectId: string,
  ): Promise<OxanaProjectWithTasks> {
    const pool = this.requirePool()
    try {
      const projectResult = await pool.query(
        `select ${PROJECT_SELECT}
         from oxana.projects p
         where p.id = $1 and p.workspace_id = $2`,
        [projectId, workspaceId],
      )
      if (!projectResult.rows[0]) {
        throw new OxanaNotFoundError()
      }
      const tasksResult = await pool.query(
        `select ${TASK_SELECT}
         from oxana.tasks t
         left join oxana.projects p
           on p.id = t.project_id and p.workspace_id = t.workspace_id
         where t.workspace_id = $1 and t.project_id = $2
         order by t.due_at nulls last, t.created_at desc`,
        [workspaceId, projectId],
      )
      return {
        project: mapProject(projectResult.rows[0] as Record<string, unknown>),
        tasks: tasksResult.rows.map((row) =>
          mapTask(row as Record<string, unknown>),
        ),
      }
    } catch (error) {
      wrapDbError(error)
    }
  }

  async createProject(
    workspaceId: string,
    userId: string,
    input: CreateProjectInput,
  ): Promise<OxanaProject> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `insert into oxana.projects (
           workspace_id, title, description, created_by, status, starts_at, due_at
         )
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, workspace_id, title, description, status, starts_at, due_at,
                   created_by, created_at, updated_at, 0::int as task_count,
                   0::int as done_count, 0::int as overdue_count`,
        [
          workspaceId,
          input.title,
          input.description,
          userId,
          input.status,
          input.startsAt,
          input.dueAt,
        ],
      )
      return mapProject(result.rows[0] as Record<string, unknown>)
    } catch (error) {
      wrapDbError(error)
    }
  }

  async listEvents(workspaceId: string): Promise<OxanaEvent[]> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `select ${EVENT_SELECT}
         from oxana.events e
         left join oxana.projects p
           on p.id = e.project_id and p.workspace_id = e.workspace_id
         where e.workspace_id = $1
         order by e.starts_at asc`,
        [workspaceId],
      )
      return result.rows.map((row) => mapEvent(row as Record<string, unknown>))
    } catch (error) {
      wrapDbError(error)
    }
  }

  async listNotifications(
    workspaceId: string,
    userId: string,
  ): Promise<OxanaNotification[]> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `select ${NOTIFICATION_SELECT}
         from oxana.notifications
         where workspace_id = $1 and user_id = $2
         order by created_at desc`,
        [workspaceId, userId],
      )
      return result.rows.map((row) =>
        mapNotification(row as Record<string, unknown>),
      )
    } catch (error) {
      wrapDbError(error)
    }
  }

  async getTask(workspaceId: string, taskId: string): Promise<OxanaTask> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `select ${TASK_SELECT}
         from oxana.tasks t
         left join oxana.projects p
           on p.id = t.project_id and p.workspace_id = t.workspace_id
         where t.workspace_id = $1 and t.id = $2`,
        [workspaceId, taskId],
      )
      if (!result.rows[0]) throw new OxanaNotFoundError()
      return mapTask(result.rows[0] as Record<string, unknown>)
    } catch (error) {
      wrapDbError(error)
    }
  }

  async deleteTask(workspaceId: string, taskId: string): Promise<void> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `delete from oxana.tasks where id = $1 and workspace_id = $2`,
        [taskId, workspaceId],
      )
      if (!result.rowCount) throw new OxanaNotFoundError()
      await pool.query(
        `update oxana.jobs
         set status = 'skipped'
         where workspace_id = $1
           and status = 'pending'
           and idempotency_key like $2`,
        [workspaceId, `task-%:${taskId}:%`],
      )
    } catch (error) {
      wrapDbError(error)
    }
  }

  async updateProject(
    workspaceId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<OxanaProject> {
    const pool = this.requirePool()
    try {
      const sets: string[] = []
      const values: unknown[] = [projectId, workspaceId]
      if (input.title !== undefined) {
        values.push(input.title)
        sets.push(`title = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'description')) {
        values.push(input.description ?? null)
        sets.push(`description = $${values.length}`)
      }
      if (input.status !== undefined) {
        values.push(input.status)
        sets.push(`status = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'startsAt')) {
        values.push(input.startsAt ?? null)
        sets.push(`starts_at = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'dueAt')) {
        values.push(input.dueAt ?? null)
        sets.push(`due_at = $${values.length}`)
      }
      if (!sets.length) {
        return this.getProjectOnly(workspaceId, projectId)
      }
      const result = await pool.query(
        `update oxana.projects
         set ${sets.join(', ')}
         where id = $1 and workspace_id = $2
         returning id`,
        values,
      )
      if (!result.rows[0]) throw new OxanaNotFoundError()
      return this.getProjectOnly(workspaceId, projectId)
    } catch (error) {
      wrapDbError(error)
    }
  }

  private async getProjectOnly(
    workspaceId: string,
    projectId: string,
  ): Promise<OxanaProject> {
    const { project } = await this.getProjectWithTasks(workspaceId, projectId)
    return project
  }

  async deleteProject(workspaceId: string, projectId: string): Promise<void> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `delete from oxana.projects where id = $1 and workspace_id = $2`,
        [projectId, workspaceId],
      )
      if (!result.rowCount) throw new OxanaNotFoundError()
    } catch (error) {
      wrapDbError(error)
    }
  }

  async getEvent(workspaceId: string, eventId: string): Promise<OxanaEvent> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `select ${EVENT_SELECT}
         from oxana.events e
         left join oxana.projects p
           on p.id = e.project_id and p.workspace_id = e.workspace_id
         where e.workspace_id = $1 and e.id = $2`,
        [workspaceId, eventId],
      )
      if (!result.rows[0]) throw new OxanaNotFoundError()
      return mapEvent(result.rows[0] as Record<string, unknown>)
    } catch (error) {
      wrapDbError(error)
    }
  }

  async createEvent(
    workspaceId: string,
    userId: string,
    input: CreateEventInput,
  ): Promise<OxanaEvent> {
    const pool = this.requirePool()
    try {
      if (input.projectId) {
        const project = await pool.query(
          `select id from oxana.projects
           where id = $1 and workspace_id = $2`,
          [input.projectId, workspaceId],
        )
        if (!project.rows[0]) {
          throw new OxanaNotFoundError()
        }
      }
      const result = await pool.query<{ id: string }>(
        `insert into oxana.events (
           workspace_id, title, description, starts_at, ends_at, remind_at,
           project_id, created_by
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          workspaceId,
          input.title,
          input.description,
          input.startsAt,
          input.endsAt,
          input.remindAt,
          input.projectId,
          userId,
        ],
      )
      if (!result.rows[0]) {
        throw new OxanaDbUnavailableError()
      }
      return this.getEvent(workspaceId, result.rows[0].id)
    } catch (error) {
      wrapDbError(error)
    }
  }

  async updateEvent(
    workspaceId: string,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<OxanaEvent> {
    const pool = this.requirePool()
    try {
      if (input.projectId) {
        const project = await pool.query(
          `select id from oxana.projects
           where id = $1 and workspace_id = $2`,
          [input.projectId, workspaceId],
        )
        if (!project.rows[0]) {
          throw new OxanaNotFoundError()
        }
      }
      const sets: string[] = []
      const values: unknown[] = [eventId, workspaceId]
      if (input.title !== undefined) {
        values.push(input.title)
        sets.push(`title = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'description')) {
        values.push(input.description ?? null)
        sets.push(`description = $${values.length}`)
      }
      if (input.startsAt !== undefined) {
        values.push(input.startsAt)
        sets.push(`starts_at = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'endsAt')) {
        values.push(input.endsAt ?? null)
        sets.push(`ends_at = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'remindAt')) {
        values.push(input.remindAt ?? null)
        sets.push(`remind_at = $${values.length}`)
      }
      if (Object.prototype.hasOwnProperty.call(input, 'projectId')) {
        values.push(input.projectId ?? null)
        sets.push(`project_id = $${values.length}`)
      }
      if (!sets.length) {
        return this.getEvent(workspaceId, eventId)
      }
      const result = await pool.query<{ id: string }>(
        `update oxana.events
         set ${sets.join(', ')}
         where id = $1 and workspace_id = $2
         returning id`,
        values,
      )
      if (!result.rows[0]) throw new OxanaNotFoundError()
      return this.getEvent(workspaceId, result.rows[0].id)
    } catch (error) {
      wrapDbError(error)
    }
  }

  async deleteEvent(workspaceId: string, eventId: string): Promise<void> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `delete from oxana.events where id = $1 and workspace_id = $2`,
        [eventId, workspaceId],
      )
      if (!result.rowCount) throw new OxanaNotFoundError()
      await pool.query(
        `update oxana.jobs
         set status = 'skipped'
         where workspace_id = $1
           and status = 'pending'
           and idempotency_key like $2`,
        [workspaceId, `event-%:${eventId}:%`],
      )
    } catch (error) {
      wrapDbError(error)
    }
  }

  async markNotificationRead(
    workspaceId: string,
    userId: string,
    notificationId: string,
  ): Promise<OxanaNotification> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `update oxana.notifications
         set read_at = coalesce(read_at, now())
         where id = $1 and workspace_id = $2 and user_id = $3
         returning ${NOTIFICATION_SELECT}`,
        [notificationId, workspaceId, userId],
      )
      if (!result.rows[0]) throw new OxanaNotFoundError()
      return mapNotification(result.rows[0] as Record<string, unknown>)
    } catch (error) {
      wrapDbError(error)
    }
  }

  async markAllNotificationsRead(
    workspaceId: string,
    userId: string,
  ): Promise<number> {
    const pool = this.requirePool()
    try {
      const result = await pool.query(
        `update oxana.notifications
         set read_at = now()
         where workspace_id = $1 and user_id = $2 and read_at is null`,
        [workspaceId, userId],
      )
      return result.rowCount ?? 0
    } catch (error) {
      wrapDbError(error)
    }
  }

  async getSettings(
    workspaceId: string,
    userId: string,
  ): Promise<OxanaOwnerSettings> {
    const pool = this.requirePool()
    try {
      const identity = await pool.query(
        `select display_name from oxana.identities where user_id = $1`,
        [userId],
      )
      const prefs = await pool.query(
        `select payload from oxana.jobs
         where workspace_id = $1 and idempotency_key = $2
         limit 1`,
        [workspaceId, `oxana-prefs:${workspaceId}`],
      )
      const payload = (prefs.rows[0]?.payload ?? {}) as Partial<OxanaOwnerSettings>
      return mergeSettings(DEFAULT_OWNER_SETTINGS, {
        ...payload,
        displayName: identity.rows[0]?.display_name
          ? String(identity.rows[0].display_name)
          : payload.displayName || '',
      })
    } catch (error) {
      wrapDbError(error)
    }
  }

  async updateSettings(
    workspaceId: string,
    userId: string,
    input: Partial<OxanaOwnerSettings>,
  ): Promise<OxanaOwnerSettings> {
    const pool = this.requirePool()
    try {
      const current = await this.getSettings(workspaceId, userId)
      const next = mergeSettings(current, input)
      if (Object.prototype.hasOwnProperty.call(input, 'displayName')) {
        await pool.query(
          `update oxana.identities set display_name = $2 where user_id = $1`,
          [userId, next.displayName || null],
        )
      }
      await pool.query(
        `insert into oxana.jobs (
           workspace_id, kind, payload, run_at, status, idempotency_key
         ) values ($1, 'digest', $2::jsonb, now() + interval '10 years', 'skipped', $3)
         on conflict (idempotency_key) do update
           set payload = excluded.payload`,
        [workspaceId, JSON.stringify(next), `oxana-prefs:${workspaceId}`],
      )
      return next
    } catch (error) {
      wrapDbError(error)
    }
  }

  async getOverview(
    workspaceId: string,
    userId: string,
  ): Promise<OxanaOverview> {
    const settings = await this.getSettings(workspaceId, userId)
    const tasks = await this.listTasks(workspaceId)
    const events = await this.listEvents(workspaceId)
    const projects = await this.listProjects(workspaceId)
    const notifications = await this.listNotifications(workspaceId, userId)
    const now = new Date()
    const dayStart = startOfDay(now, settings.timezone)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const liveTasks = tasks.filter((task) => !task.archivedAt)
    const openTasks = liveTasks.filter(
      (task) => task.status === 'open' || task.status === 'in_progress',
    )
    const todayTasks = openTasks.filter((task) => {
      if (!task.dueAt) return false
      const due = new Date(task.dueAt)
      return due >= dayStart && due < dayEnd
    })
    const overdueTasks = openTasks.filter(
      (task) => task.dueAt && new Date(task.dueAt) < now,
    )
    const finished = liveTasks.filter((task) => task.status === 'done').length
    return {
      displayName: settings.displayName,
      timezone: settings.timezone,
      todayTasks,
      overdueTasks,
      upcomingEvents: events
        .filter((event) => new Date(event.startsAt) >= now)
        .slice(0, 5),
      activeProjects: projects.filter((project) => project.status === 'active'),
      completionPercent: liveTasks.length
        ? Math.round((finished / liveTasks.length) * 100)
        : 0,
      latestNotifications: notifications.slice(0, 5),
      unreadCount: notifications.filter((item) => !item.readAt).length,
    }
  }

  async scheduleRemindersForTask(
    workspaceId: string,
    userId: string,
    task: OxanaTask,
  ): Promise<void> {
    const settings = await this.getSettings(workspaceId, userId)
    if (
      !task.dueAt ||
      task.archivedAt ||
      task.status === 'done' ||
      task.status === 'cancelled'
    ) {
      await this.skipPendingJobs(workspaceId, `task-%:${task.id}:%`)
      return
    }
    const due = new Date(task.dueAt)
    const day = startOfDay(due, settings.timezone)
    const jobs = [
      settings.notifyTaskDueSoon
        ? {
            key: `task-soon:${task.id}:${due.toISOString()}`,
            runAt: new Date(due.getTime() - settings.taskSoonHours * 3600_000),
            title: 'Срок задачи завтра',
            body: `[[task:${task.id}]]\n«${task.title}» — срок через ${settings.taskSoonHours} ч.`,
          }
        : null,
      settings.notifyTaskDueDay
        ? {
            key: `task-day:${task.id}:${due.toISOString()}`,
            runAt: day,
            title: 'Срок задачи сегодня',
            body: `[[task:${task.id}]]\n«${task.title}» нужно закрыть сегодня.`,
          }
        : null,
      settings.notifyTaskOverdue
        ? {
            key: `task-overdue:${task.id}:${due.toISOString()}`,
            runAt: due,
            title: 'Задача просрочена',
            body: `[[task:${task.id}]]\n«${task.title}» вышла за срок.`,
          }
        : null,
    ]
    await this.skipPendingJobs(workspaceId, `task-%:${task.id}:%`)
    await this.upsertReminderJobs(workspaceId, userId, jobs)
  }

  async scheduleRemindersForEvent(
    workspaceId: string,
    userId: string,
    event: OxanaEvent,
  ): Promise<void> {
    const settings = await this.getSettings(workspaceId, userId)
    await this.skipPendingJobs(workspaceId, `event-%:${event.id}:%`)
    if (!settings.notifyEvent) return
    const starts = new Date(event.startsAt)
    const runAt = event.remindAt
      ? new Date(event.remindAt)
      : new Date(starts.getTime() - settings.eventSoonMinutes * 60_000)
    await this.upsertReminderJobs(workspaceId, userId, [
      {
        key: `event-soon:${event.id}:${starts.toISOString()}`,
        runAt,
        title: 'Скоро событие',
        body: `[[event:${event.id}]]\n«${event.title}» начнётся в календаре ОКСИ.`,
      },
    ])
  }

  private async skipPendingJobs(workspaceId: string, like: string) {
    const pool = this.requirePool()
    await pool.query(
      `update oxana.jobs
       set status = 'skipped'
       where workspace_id = $1 and status = 'pending' and idempotency_key like $2
         and idempotency_key <> $3`,
      [workspaceId, like, `oxana-prefs:${workspaceId}`],
    )
  }

  private async upsertReminderJobs(
    workspaceId: string,
    userId: string,
    jobs: Array<{
      key: string
      runAt: Date
      title: string
      body: string
    } | null>,
  ) {
    const pool = this.requirePool()
    for (const job of jobs) {
      if (!job || isReminderRunAtTooOld(job.runAt)) continue
      await pool.query(
        `insert into oxana.jobs (
           workspace_id, kind, payload, run_at, status, idempotency_key
         ) values ($1, 'reminder', $2::jsonb, $3, 'pending', $4)
         on conflict (idempotency_key) do update
           set run_at = excluded.run_at,
               payload = excluded.payload,
               status = case
                 when oxana.jobs.status = 'sent' then oxana.jobs.status
                 else 'pending'
               end`,
        [
          workspaceId,
          JSON.stringify({
            userId,
            title: job.title,
            body: job.body,
            ...parseNotificationSource(job.body),
          }),
          job.runAt.toISOString(),
          job.key,
        ],
      )
    }
  }
}

export const pgOxanaRepo = new PgOxanaRepo()
