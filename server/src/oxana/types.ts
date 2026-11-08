export type OxanaTaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled'
export type OxanaTaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type OxanaProjectStatus =
  | 'planned'
  | 'active'
  | 'paused'
  | 'done'
  | 'archived'
export type OxanaNotificationSource = 'task' | 'project' | 'event'

export interface OxanaWorkspace {
  id: string
  slug: string
  name: string
  kind: 'owner' | 'client'
}

export interface OxanaTask {
  id: string
  workspaceId: string
  projectId: string | null
  projectTitle: string | null
  title: string
  description: string | null
  status: OxanaTaskStatus
  priority: OxanaTaskPriority
  dueAt: string | null
  archivedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface OxanaProject {
  id: string
  workspaceId: string
  title: string
  description: string | null
  status: OxanaProjectStatus
  startsAt: string | null
  dueAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  taskCount: number
  doneCount: number
  overdueCount: number
}

export interface OxanaEvent {
  id: string
  workspaceId: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  remindAt: string | null
  projectId: string | null
  projectTitle: string | null
  createdBy: string
  createdAt: string
}

export interface OxanaNotification {
  id: string
  workspaceId: string
  userId: string
  title: string
  body: string | null
  channel: 'web' | 'telegram' | 'max'
  sourceType: OxanaNotificationSource | null
  sourceId: string | null
  readAt: string | null
  createdAt: string
}

export interface CreateTaskInput {
  title: string
  description: string | null
  projectId: string | null
  dueAt: string | null
  priority: OxanaTaskPriority
}

export interface CreateProjectInput {
  title: string
  description: string | null
  status: OxanaProjectStatus
  startsAt: string | null
  dueAt: string | null
}

export interface UpdateTaskInput {
  status?: OxanaTaskStatus
  projectId?: string | null
  title?: string
  description?: string | null
  dueAt?: string | null
  priority?: OxanaTaskPriority
  archivedAt?: string | null
}

export interface UpdateTaskOptions {
  expectedUpdatedAt?: string | null
}

export interface UpdateProjectInput {
  title?: string
  description?: string | null
  status?: OxanaProjectStatus
  startsAt?: string | null
  dueAt?: string | null
}

export interface CreateEventInput {
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  remindAt: string | null
  projectId: string | null
}

export interface UpdateEventInput {
  title?: string
  description?: string | null
  startsAt?: string
  endsAt?: string | null
  remindAt?: string | null
  projectId?: string | null
}

export interface OxanaOwnerSettings {
  displayName: string
  timezone: string
  dateFormat: 'date' | 'datetime'
  notifyTaskDueSoon: boolean
  notifyTaskDueDay: boolean
  notifyTaskOverdue: boolean
  notifyEvent: boolean
  taskSoonHours: number
  eventSoonMinutes: number
}

export interface OxanaOverview {
  displayName: string
  timezone: string
  todayTasks: OxanaTask[]
  overdueTasks: OxanaTask[]
  upcomingEvents: OxanaEvent[]
  activeProjects: OxanaProject[]
  completionPercent: number
  latestNotifications: OxanaNotification[]
  unreadCount: number
}

export interface OxanaProjectWithTasks {
  project: OxanaProject
  tasks: OxanaTask[]
}

export interface OxanaRepository {
  ensureWorkspaceForUser(userId: string): Promise<OxanaWorkspace>
  listTasks(workspaceId: string): Promise<OxanaTask[]>
  getTask(workspaceId: string, taskId: string): Promise<OxanaTask>
  createTask(
    workspaceId: string,
    userId: string,
    input: CreateTaskInput,
  ): Promise<OxanaTask>
  createTaskIdempotent(
    workspaceId: string,
    userId: string,
    input: CreateTaskInput,
    idempotencyKey: string | null,
  ): Promise<{ task: OxanaTask; replayed: boolean }>
  updateTask(
    workspaceId: string,
    taskId: string,
    input: UpdateTaskInput,
    options?: UpdateTaskOptions,
  ): Promise<OxanaTask>
  deleteTask(workspaceId: string, taskId: string): Promise<void>
  listProjects(workspaceId: string): Promise<OxanaProject[]>
  getProjectWithTasks(
    workspaceId: string,
    projectId: string,
  ): Promise<OxanaProjectWithTasks>
  createProject(
    workspaceId: string,
    userId: string,
    input: CreateProjectInput,
  ): Promise<OxanaProject>
  updateProject(
    workspaceId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<OxanaProject>
  deleteProject(workspaceId: string, projectId: string): Promise<void>
  listEvents(workspaceId: string): Promise<OxanaEvent[]>
  getEvent(workspaceId: string, eventId: string): Promise<OxanaEvent>
  createEvent(
    workspaceId: string,
    userId: string,
    input: CreateEventInput,
  ): Promise<OxanaEvent>
  updateEvent(
    workspaceId: string,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<OxanaEvent>
  deleteEvent(workspaceId: string, eventId: string): Promise<void>
  listNotifications(
    workspaceId: string,
    userId: string,
  ): Promise<OxanaNotification[]>
  markNotificationRead(
    workspaceId: string,
    userId: string,
    notificationId: string,
  ): Promise<OxanaNotification>
  markAllNotificationsRead(workspaceId: string, userId: string): Promise<number>
  getSettings(workspaceId: string, userId: string): Promise<OxanaOwnerSettings>
  updateSettings(
    workspaceId: string,
    userId: string,
    input: Partial<OxanaOwnerSettings>,
  ): Promise<OxanaOwnerSettings>
  getOverview(workspaceId: string, userId: string): Promise<OxanaOverview>
  scheduleRemindersForTask(
    workspaceId: string,
    userId: string,
    task: OxanaTask,
  ): Promise<void>
  scheduleRemindersForEvent(
    workspaceId: string,
    userId: string,
    event: OxanaEvent,
  ): Promise<void>
}
