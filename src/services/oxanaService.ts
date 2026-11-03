import type {
  OxanaApiError,
  OxanaEvent,
  OxanaNotification,
  OxanaProject,
  OxanaStatus,
  OxanaTask,
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
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
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
  input: { title: string; description?: string; dueAt?: string; projectId?: string },
) {
  return oxanaRequest<{ ok: true; task: OxanaTask }>('/api/oxana/tasks', {
    token,
    method: 'POST',
    body: input,
  })
}

export async function updateOxanaTaskStatus(
  token: string,
  taskId: string,
  status: OxanaTaskStatus,
) {
  return oxanaRequest<{ ok: true; task: OxanaTask }>(
    `/api/oxana/tasks/${taskId}`,
    {
      token,
      method: 'PATCH',
      body: { status },
    },
  )
}

export async function fetchOxanaProjects(token: string) {
  return oxanaRequest<{ ok: true; projects: OxanaProject[] }>(
    '/api/oxana/projects',
    { token },
  )
}

export async function createOxanaProject(
  token: string,
  input: { title: string; description?: string },
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

export async function fetchOxanaNotifications(token: string) {
  return oxanaRequest<{ ok: true; notifications: OxanaNotification[] }>(
    '/api/oxana/notifications',
    { token },
  )
}

export async function sendOxanaChat(token: string, message: string) {
  return oxanaRequest<{ ok: false; error: string }>('/api/oxana/chat', {
    token,
    method: 'POST',
    body: { message },
  })
}
