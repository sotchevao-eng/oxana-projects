export type OxanaTaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled'
export type OxanaProjectStatus = 'active' | 'paused' | 'done' | 'archived'

export interface OxanaTask {
  id: string
  workspaceId: string
  projectId: string | null
  title: string
  description: string | null
  status: OxanaTaskStatus
  dueAt: string | null
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
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface OxanaEvent {
  id: string
  workspaceId: string
  title: string
  startsAt: string
  endsAt: string | null
  remindAt: string | null
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
  readAt: string | null
  createdAt: string
}

export interface OxanaStatus {
  workspace: {
    id: string
    name: string
    kind: string
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

export interface OxanaApiError {
  ok: false
  error: string
  message?: string
}
