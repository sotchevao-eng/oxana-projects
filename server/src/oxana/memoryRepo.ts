import { randomUUID } from 'node:crypto'
import {
  OxanaConflictError,
  OxanaIdempotencyConflictError,
  OxanaNotFoundError,
} from './errors.js'
import { resolveTaskUpdateGuard } from './taskPatch.js'
import {
  hashTaskCreateInput,
  taskCreateKeyMapId,
} from './idempotency.js'
import { DEFAULT_OWNER_SETTINGS, mergeSettings } from './settingsDefaults.js'
import { startOfDay } from './time.js'
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
  UpdateTaskOptions,
} from './types.js'

export class MemoryOxanaRepo implements OxanaRepository {
  private readonly identities = new Map<string, string | null>()
  private readonly workspaces = new Map<string, OxanaWorkspace>()
  private readonly memberships: Array<{ userId: string; workspaceId: string }> =
    []
  private readonly tasks = new Map<string, OxanaTask>()
  private readonly projects = new Map<string, OxanaProject>()
  private readonly events: OxanaEvent[] = []
  private readonly notifications: OxanaNotification[] = []
  private readonly settings = new Map<string, OxanaOwnerSettings>()
  private readonly taskCreateKeys = new Map<
    string,
    { hash: string; taskId?: string; inflight?: Promise<OxanaTask> }
  >()

  async ensureWorkspaceForUser(userId: string): Promise<OxanaWorkspace> {
    if (!this.identities.has(userId)) {
      this.identities.set(userId, null)
    }
    const owner = this.memberships
      .filter((item) => item.userId === userId)
      .map((item) => this.workspaces.get(item.workspaceId))
      .find((workspace) => workspace?.kind === 'owner')
    if (owner) {
      return owner
    }

    const workspace: OxanaWorkspace = {
      id: randomUUID(),
      slug: `owner-${userId.slice(0, 8)}`,
      name: 'OXANA',
      kind: 'owner',
    }
    this.workspaces.set(workspace.id, workspace)
    this.memberships.push({ userId, workspaceId: workspace.id })
    return workspace
  }

  assignUserToWorkspace(userId: string, workspace: OxanaWorkspace): void {
    this.identities.set(userId, this.identities.get(userId) ?? null)
    this.workspaces.set(workspace.id, workspace)
    const exists = this.memberships.some(
      (item) => item.userId === userId && item.workspaceId === workspace.id,
    )
    if (!exists) {
      this.memberships.push({ userId, workspaceId: workspace.id })
    }
  }

  private projectTitle(
    workspaceId: string,
    projectId: string | null,
  ): string | null {
    if (!projectId) return null
    const project = this.projects.get(projectId)
    if (!project || project.workspaceId !== workspaceId) return null
    return project.title
  }

  private withProjectTitle(task: OxanaTask): OxanaTask {
    return {
      ...task,
      projectTitle: this.projectTitle(task.workspaceId, task.projectId),
    }
  }

  private withCounts(project: OxanaProject): OxanaProject {
    const related = [...this.tasks.values()].filter(
      (task) => task.projectId === project.id && !task.archivedAt,
    )
    const now = Date.now()
    return {
      ...project,
      taskCount: related.length,
      doneCount: related.filter((task) => task.status === 'done').length,
      overdueCount: related.filter(
        (task) =>
          Boolean(task.dueAt) &&
          new Date(task.dueAt as string).getTime() < now &&
          (task.status === 'open' || task.status === 'in_progress'),
      ).length,
    }
  }

  async listTasks(workspaceId: string): Promise<OxanaTask[]> {
    return [...this.tasks.values()]
      .filter((task) => task.workspaceId === workspaceId)
      .map((task) => this.withProjectTitle(task))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getTask(workspaceId: string, taskId: string): Promise<OxanaTask> {
    const task = this.tasks.get(taskId)
    if (!task || task.workspaceId !== workspaceId) {
      throw new OxanaNotFoundError()
    }
    return this.withProjectTitle(task)
  }

  async createTask(
    workspaceId: string,
    userId: string,
    input: CreateTaskInput,
  ): Promise<OxanaTask> {
    if (input.projectId) {
      const project = this.projects.get(input.projectId)
      if (!project || project.workspaceId !== workspaceId) {
        throw new OxanaNotFoundError()
      }
    }
    const now = new Date().toISOString()
    const task: OxanaTask = {
      id: randomUUID(),
      workspaceId,
      projectId: input.projectId,
      projectTitle: this.projectTitle(workspaceId, input.projectId),
      title: input.title,
      description: input.description,
      status: 'open',
      priority: input.priority,
      dueAt: input.dueAt,
      archivedAt: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }
    this.tasks.set(task.id, task)
    return task
  }

  async createTaskIdempotent(
    workspaceId: string,
    userId: string,
    input: CreateTaskInput,
    idempotencyKey: string | null,
  ): Promise<{ task: OxanaTask; replayed: boolean }> {
    if (!idempotencyKey) {
      return { task: await this.createTask(workspaceId, userId, input), replayed: false }
    }

    const mapKey = taskCreateKeyMapId(userId, idempotencyKey)
    const hash = hashTaskCreateInput(input)
    const existing = this.taskCreateKeys.get(mapKey)
    if (existing) {
      if (existing.hash !== hash) {
        throw new OxanaIdempotencyConflictError()
      }
      const task = existing.taskId
        ? await this.getTask(workspaceId, existing.taskId)
        : await existing.inflight!
      return { task, replayed: true }
    }

    const inflight = this.createTask(workspaceId, userId, input)
    this.taskCreateKeys.set(mapKey, { hash, inflight })
    try {
      const task = await inflight
      this.taskCreateKeys.set(mapKey, { hash, taskId: task.id })
      return { task, replayed: false }
    } catch (error) {
      this.taskCreateKeys.delete(mapKey)
      throw error
    }
  }

  async updateTask(
    workspaceId: string,
    taskId: string,
    input: UpdateTaskInput,
    options?: UpdateTaskOptions,
  ): Promise<OxanaTask> {
    const task = this.tasks.get(taskId)
    if (!task || task.workspaceId !== workspaceId) {
      throw new OxanaNotFoundError()
    }
    if (options?.expectedUpdatedAt) {
      const guard = resolveTaskUpdateGuard(
        task,
        input,
        options.expectedUpdatedAt,
      )
      if (guard === 'replay') {
        return this.withProjectTitle(task)
      }
      if (guard === 'conflict') {
        throw new OxanaConflictError()
      }
    }
    if (input.projectId) {
      const project = this.projects.get(input.projectId)
      if (!project || project.workspaceId !== workspaceId) {
        throw new OxanaNotFoundError()
      }
    }
    const previousStamp = new Date(task.updatedAt).getTime()
    const nextStamp = Number.isNaN(previousStamp)
      ? Date.now()
      : Math.max(Date.now(), previousStamp + 1)
    const updated: OxanaTask = {
      ...task,
      status: input.status ?? task.status,
      projectId: Object.prototype.hasOwnProperty.call(input, 'projectId')
        ? (input.projectId ?? null)
        : task.projectId,
      title: input.title ?? task.title,
      description: Object.prototype.hasOwnProperty.call(input, 'description')
        ? (input.description ?? null)
        : task.description,
      dueAt: Object.prototype.hasOwnProperty.call(input, 'dueAt')
        ? (input.dueAt ?? null)
        : task.dueAt,
      priority: input.priority ?? task.priority,
      archivedAt: Object.prototype.hasOwnProperty.call(input, 'archivedAt')
        ? (input.archivedAt ?? null)
        : task.archivedAt,
      updatedAt: new Date(nextStamp).toISOString(),
    }
    updated.projectTitle = this.projectTitle(workspaceId, updated.projectId)
    this.tasks.set(taskId, updated)
    return updated
  }

  async deleteTask(workspaceId: string, taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.workspaceId !== workspaceId) {
      throw new OxanaNotFoundError()
    }
    this.tasks.delete(taskId)
  }

  async listProjects(workspaceId: string): Promise<OxanaProject[]> {
    return [...this.projects.values()]
      .filter((project) => project.workspaceId === workspaceId)
      .map((project) => this.withCounts(project))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getProjectWithTasks(
    workspaceId: string,
    projectId: string,
  ): Promise<OxanaProjectWithTasks> {
    const project = this.projects.get(projectId)
    if (!project || project.workspaceId !== workspaceId) {
      throw new OxanaNotFoundError()
    }
    const tasks = [...this.tasks.values()]
      .filter(
        (task) =>
          task.workspaceId === workspaceId && task.projectId === projectId,
      )
      .map((task) => this.withProjectTitle(task))
    return { project: this.withCounts(project), tasks }
  }

  async createProject(
    workspaceId: string,
    userId: string,
    input: CreateProjectInput,
  ): Promise<OxanaProject> {
    const now = new Date().toISOString()
    const project: OxanaProject = {
      id: randomUUID(),
      workspaceId,
      title: input.title,
      description: input.description,
      status: input.status,
      startsAt: input.startsAt,
      dueAt: input.dueAt,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      taskCount: 0,
      doneCount: 0,
      overdueCount: 0,
    }
    this.projects.set(project.id, project)
    return project
  }

  async updateProject(
    workspaceId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<OxanaProject> {
    const project = this.projects.get(projectId)
    if (!project || project.workspaceId !== workspaceId) {
      throw new OxanaNotFoundError()
    }
    const updated: OxanaProject = {
      ...project,
      title: input.title ?? project.title,
      description: Object.prototype.hasOwnProperty.call(input, 'description')
        ? (input.description ?? null)
        : project.description,
      status: input.status ?? project.status,
      startsAt: Object.prototype.hasOwnProperty.call(input, 'startsAt')
        ? (input.startsAt ?? null)
        : project.startsAt,
      dueAt: Object.prototype.hasOwnProperty.call(input, 'dueAt')
        ? (input.dueAt ?? null)
        : project.dueAt,
      updatedAt: new Date().toISOString(),
    }
    this.projects.set(projectId, updated)
    return this.withCounts(updated)
  }

  async deleteProject(workspaceId: string, projectId: string): Promise<void> {
    const project = this.projects.get(projectId)
    if (!project || project.workspaceId !== workspaceId) {
      throw new OxanaNotFoundError()
    }
    this.projects.delete(projectId)
    for (const task of this.tasks.values()) {
      if (task.projectId === projectId) {
        task.projectId = null
        task.projectTitle = null
      }
    }
    for (const event of this.events) {
      if (event.projectId === projectId) {
        event.projectId = null
        event.projectTitle = null
      }
    }
  }

  async listEvents(workspaceId: string): Promise<OxanaEvent[]> {
    return this.events
      .filter((event) => event.workspaceId === workspaceId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }

  async getEvent(workspaceId: string, eventId: string): Promise<OxanaEvent> {
    const event = this.events.find(
      (item) => item.id === eventId && item.workspaceId === workspaceId,
    )
    if (!event) throw new OxanaNotFoundError()
    return event
  }

  async createEvent(
    workspaceId: string,
    userId: string,
    input: CreateEventInput,
  ): Promise<OxanaEvent> {
    if (input.projectId) {
      const project = this.projects.get(input.projectId)
      if (!project || project.workspaceId !== workspaceId) {
        throw new OxanaNotFoundError()
      }
    }
    const event: OxanaEvent = {
      id: randomUUID(),
      workspaceId,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      remindAt: input.remindAt,
      projectId: input.projectId,
      projectTitle: this.projectTitle(workspaceId, input.projectId),
      createdBy: userId,
      createdAt: new Date().toISOString(),
    }
    this.events.push(event)
    return event
  }

  async updateEvent(
    workspaceId: string,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<OxanaEvent> {
    const event = await this.getEvent(workspaceId, eventId)
    if (input.projectId) {
      const project = this.projects.get(input.projectId)
      if (!project || project.workspaceId !== workspaceId) {
        throw new OxanaNotFoundError()
      }
    }
    const updated: OxanaEvent = {
      ...event,
      title: input.title ?? event.title,
      description: Object.prototype.hasOwnProperty.call(input, 'description')
        ? (input.description ?? null)
        : event.description,
      startsAt: input.startsAt ?? event.startsAt,
      endsAt: Object.prototype.hasOwnProperty.call(input, 'endsAt')
        ? (input.endsAt ?? null)
        : event.endsAt,
      remindAt: Object.prototype.hasOwnProperty.call(input, 'remindAt')
        ? (input.remindAt ?? null)
        : event.remindAt,
      projectId: Object.prototype.hasOwnProperty.call(input, 'projectId')
        ? (input.projectId ?? null)
        : event.projectId,
    }
    updated.projectTitle = this.projectTitle(workspaceId, updated.projectId)
    const index = this.events.findIndex((item) => item.id === eventId)
    this.events[index] = updated
    return updated
  }

  async deleteEvent(workspaceId: string, eventId: string): Promise<void> {
    const index = this.events.findIndex(
      (item) => item.id === eventId && item.workspaceId === workspaceId,
    )
    if (index < 0) throw new OxanaNotFoundError()
    this.events.splice(index, 1)
  }

  async listNotifications(
    workspaceId: string,
    userId: string,
  ): Promise<OxanaNotification[]> {
    return this.notifications
      .filter(
        (item) => item.workspaceId === workspaceId && item.userId === userId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async markNotificationRead(
    workspaceId: string,
    userId: string,
    notificationId: string,
  ): Promise<OxanaNotification> {
    const item = this.notifications.find(
      (row) =>
        row.id === notificationId &&
        row.workspaceId === workspaceId &&
        row.userId === userId,
    )
    if (!item) throw new OxanaNotFoundError()
    item.readAt = item.readAt ?? new Date().toISOString()
    return item
  }

  async markAllNotificationsRead(
    workspaceId: string,
    userId: string,
  ): Promise<number> {
    let count = 0
    for (const item of this.notifications) {
      if (
        item.workspaceId === workspaceId &&
        item.userId === userId &&
        !item.readAt
      ) {
        item.readAt = new Date().toISOString()
        count += 1
      }
    }
    return count
  }

  async getSettings(
    workspaceId: string,
    userId: string,
  ): Promise<OxanaOwnerSettings> {
    const stored = this.settings.get(workspaceId)
    return mergeSettings(DEFAULT_OWNER_SETTINGS, {
      ...stored,
      displayName: this.identities.get(userId) ?? stored?.displayName ?? '',
    })
  }

  async updateSettings(
    workspaceId: string,
    userId: string,
    input: Partial<OxanaOwnerSettings>,
  ): Promise<OxanaOwnerSettings> {
    const next = mergeSettings(await this.getSettings(workspaceId, userId), input)
    this.settings.set(workspaceId, next)
    if (Object.prototype.hasOwnProperty.call(input, 'displayName')) {
      this.identities.set(userId, next.displayName || null)
    }
    return next
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
    return {
      displayName: settings.displayName,
      timezone: settings.timezone,
      todayTasks: openTasks.filter((task) => {
        if (!task.dueAt) return false
        const due = new Date(task.dueAt)
        return due >= dayStart && due < dayEnd
      }),
      overdueTasks: openTasks.filter(
        (task) => task.dueAt && new Date(task.dueAt) < now,
      ),
      upcomingEvents: events
        .filter((event) => new Date(event.startsAt) >= now)
        .slice(0, 5),
      activeProjects: projects.filter((project) => project.status === 'active'),
      completionPercent: liveTasks.length
        ? Math.round(
            (liveTasks.filter((task) => task.status === 'done').length /
              liveTasks.length) *
              100,
          )
        : 0,
      latestNotifications: notifications.slice(0, 5),
      unreadCount: notifications.filter((item) => !item.readAt).length,
    }
  }

  addNotification(
    workspaceId: string,
    userId: string,
    title: string,
    body: string | null = null,
    sourceType: OxanaNotification['sourceType'] = null,
    sourceId: string | null = null,
  ): OxanaNotification {
    const item: OxanaNotification = {
      id: randomUUID(),
      workspaceId,
      userId,
      title,
      body,
      channel: 'web',
      sourceType,
      sourceId,
      readAt: null,
      createdAt: new Date().toISOString(),
    }
    this.notifications.push(item)
    return item
  }

  async scheduleRemindersForTask(
    _workspaceId: string,
    _userId: string,
    _task: OxanaTask,
  ): Promise<void> {
    return
  }

  async scheduleRemindersForEvent(
    _workspaceId: string,
    _userId: string,
    _event: OxanaEvent,
  ): Promise<void> {
    return
  }
}
