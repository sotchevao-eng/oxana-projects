import type {
  OxanaApiError,
  OxanaEvent,
  OxanaNotification,
  OxanaOverview,
  OxanaOwnerSettings,
  OxanaProject,
  OxanaProjectStatus,
  OxanaStatus,
  OxanaTask,
  OxanaTaskPriority,
  OxanaTaskStatus,
} from '../types/oxana'
import { oxanaErrorMessage } from '../utils/oxanaErrors'

function apiBaseUrl(): string {
  return import.meta.env.VITE_OXANA_API_URL?.trim().replace(/\/$/, '') ?? ''
}

export function isOxanaApiConfigured(): boolean {
  return Boolean(apiBaseUrl())
}

interface RequestOptions {
  token: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

async function oxanaRequest<T>(
  path: string,
  options: RequestOptions,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!isOxanaApiConfigured()) {
    return { ok: false, error: oxanaErrorMessage('api_not_configured') }
  }

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })

    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok) {
      const record = payload as OxanaApiError | null
      return {
        ok: false,
        error: oxanaErrorMessage(record?.error, record?.message),
      }
    }

    return { ok: true, data: payload as T }
  } catch {
    return {
      ok: false,
      error: oxanaErrorMessage('oxana_db_unavailable'),
    }
  }
}

export async function fetchOxanaStatus(token: string) {
  return oxanaRequest<{ ok: true } & OxanaStatus>('/api/oxana/status', { token })
}

export async function fetchOxanaTasks(token: string) {
  return oxanaRequest<{ ok: true; tasks: OxanaTask[] }>('/api/oxana/tasks', {
    token,
  })
}

export async function createOxanaTask(
  token: string,
  input: {
    title: string
    description?: string
    dueAt?: string
    projectId?: string
    priority?: OxanaTaskPriority
  },
) {
  return oxanaRequest<{ ok: true; task: OxanaTask }>('/api/oxana/tasks', {
    token,
    method: 'POST',
    body: input,
  })
}

export async function updateOxanaTask(
  token: string,
  taskId: string,
  input: {
    status?: OxanaTaskStatus
    projectId?: string | null
    title?: string
    description?: string | null
    dueAt?: string | null
    priority?: OxanaTaskPriority
    archivedAt?: string | null
  },
) {
  return oxanaRequest<{ ok: true; task: OxanaTask }>(
    `/api/oxana/tasks/${taskId}`,
    {
      token,
      method: 'PATCH',
      body: input,
    },
  )
}

export async function updateOxanaTaskStatus(
  token: string,
  taskId: string,
  status: OxanaTaskStatus,
) {
  return updateOxanaTask(token, taskId, { status })
}

export async function fetchOxanaProjects(token: string) {
  return oxanaRequest<{ ok: true; projects: OxanaProject[] }>(
    '/api/oxana/projects',
    { token },
  )
}

export async function fetchOxanaProject(token: string, projectId: string) {
  return oxanaRequest<{ ok: true; project: OxanaProject; tasks: OxanaTask[] }>(
    `/api/oxana/projects/${projectId}`,
    { token },
  )
}

export async function createOxanaProject(
  token: string,
  input: {
    title: string
    description?: string
    status?: OxanaProjectStatus
    startsAt?: string
    dueAt?: string
  },
) {
  return oxanaRequest<{ ok: true; project: OxanaProject }>(
    '/api/oxana/projects',
    {
      token,
      method: 'POST',
      body: input,
    },
  )
}

export async function fetchOxanaEvents(token: string) {
  return oxanaRequest<{ ok: true; events: OxanaEvent[] }>('/api/oxana/events', {
    token,
  })
}

export async function deleteOxanaTask(token: string, taskId: string) {
  return oxanaRequest<{ ok: true }>(`/api/oxana/tasks/${taskId}`, {
    token,
    method: 'DELETE',
  })
}

export async function updateOxanaProject(
  token: string,
  projectId: string,
  input: {
    title?: string
    description?: string | null
    status?: OxanaProjectStatus
    startsAt?: string | null
    dueAt?: string | null
  },
) {
  return oxanaRequest<{ ok: true; project: OxanaProject }>(
    `/api/oxana/projects/${projectId}`,
    {
      token,
      method: 'PATCH',
      body: input,
    },
  )
}

export async function deleteOxanaProject(token: string, projectId: string) {
  return oxanaRequest<{ ok: true }>(`/api/oxana/projects/${projectId}`, {
    token,
    method: 'DELETE',
  })
}

export async function createOxanaEvent(
  token: string,
  input: {
    title: string
    description?: string
    startsAt: string
    endsAt?: string
    remindAt?: string
    projectId?: string
  },
) {
  return oxanaRequest<{ ok: true; event: OxanaEvent }>('/api/oxana/events', {
    token,
    method: 'POST',
    body: input,
  })
}

export async function updateOxanaEvent(
  token: string,
  eventId: string,
  input: {
    title?: string
    description?: string | null
    startsAt?: string
    endsAt?: string | null
    remindAt?: string | null
    projectId?: string | null
  },
) {
  return oxanaRequest<{ ok: true; event: OxanaEvent }>(
    `/api/oxana/events/${eventId}`,
    {
      token,
      method: 'PATCH',
      body: input,
    },
  )
}

export async function deleteOxanaEvent(token: string, eventId: string) {
  return oxanaRequest<{ ok: true }>(`/api/oxana/events/${eventId}`, {
    token,
    method: 'DELETE',
  })
}

export async function fetchOxanaNotifications(
  token: string,
  signal?: AbortSignal,
) {
  return oxanaRequest<{ ok: true; notifications: OxanaNotification[] }>(
    '/api/oxana/notifications',
    { token, signal },
  )
}

export async function markOxanaNotificationRead(
  token: string,
  notificationId: string,
) {
  return oxanaRequest<{ ok: true; notification: OxanaNotification }>(
    `/api/oxana/notifications/${notificationId}`,
    { token, method: 'PATCH' },
  )
}

export async function markAllOxanaNotificationsRead(token: string) {
  return oxanaRequest<{ ok: true; updated: number }>(
    '/api/oxana/notifications/read-all',
    { token, method: 'POST' },
  )
}

export async function fetchOxanaSettings(token: string) {
  return oxanaRequest<{ ok: true; settings: OxanaOwnerSettings }>(
    '/api/oxana/settings',
    { token },
  )
}

export async function updateOxanaSettings(
  token: string,
  input: Partial<OxanaOwnerSettings>,
) {
  return oxanaRequest<{ ok: true; settings: OxanaOwnerSettings }>(
    '/api/oxana/settings',
    { token, method: 'PATCH', body: input },
  )
}

export async function fetchOxanaOverview(token: string) {
  return oxanaRequest<{ ok: true } & OxanaOverview>('/api/oxana/overview', {
    token,
  })
}

export async function sendOxanaChat(token: string, message: string) {
  return oxanaRequest<{ ok: true; reply: string; provider: string }>(
    '/api/oxana/chat',
    {
      token,
      method: 'POST',
      body: { message },
    },
  )
}

export interface OxanaGigachatModelsDiag {
  status: number | null
  models: string[]
}

function readModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const models = (payload as { models?: unknown }).models
  if (!Array.isArray(models)) {
    return []
  }
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of models) {
    const id = typeof item === 'string' ? item.trim() : ''
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    ids.push(id)
    if (ids.length >= 50) {
      break
    }
  }
  return ids
}

export async function fetchOxanaGigachatModels(
  token: string,
): Promise<OxanaGigachatModelsDiag> {
  if (!isOxanaApiConfigured()) {
    return { status: null, models: [] }
  }
  try {
    const response = await fetch(`${apiBaseUrl()}/api/oxana/ai/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    return {
      status: response.status,
      models: readModelIds(payload),
    }
  } catch {
    return { status: null, models: [] }
  }
}
