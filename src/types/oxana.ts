export type OxanaTaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled'
export type OxanaTaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type OxanaProjectStatus =
  | 'planned'
  | 'active'
  | 'paused'
  | 'done'
  | 'archived'
export type OxanaNotificationSource = 'task' | 'project' | 'event'

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
  taskCount?: number
  doneCount?: number
  overdueCount?: number
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

export interface OxanaStatus {
  workspace: {
    id: string
    name: string
    kind: string
  }
  database?: {
    connected: boolean
  }
  api?: {
    ready: boolean
  }
  ai: {
    provider: string
    configured: boolean
    ready: boolean
  }
  channels: {
    telegram: boolean
    max: boolean
  }
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

export interface OxanaApiError {
  ok: false
  error: string
  message?: string
}
