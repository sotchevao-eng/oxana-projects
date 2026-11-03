import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { OxanaMascot } from '../../../components/admin/oxana/OxanaMascot'
import { Button } from '../../../components/Button'
import { DataStatus } from '../../../components/DataStatus'
import { useToast } from '../../../components/ToastProvider'
import { useAuth } from '../../../hooks/useAuth'
import { formatAdminDate, formatAdminDateTime } from '../../../services/adminService'
import {
  createOxanaProject,
  createOxanaTask,
  fetchOxanaEvents,
  fetchOxanaNotifications,
  fetchOxanaProjects,
  fetchOxanaStatus,
  fetchOxanaTasks,
  isOxanaApiConfigured,
  sendOxanaChat,
  updateOxanaTaskStatus,
} from '../../../services/oxanaService'
import type {
  OxanaEvent,
  OxanaNotification,
  OxanaProject,
  OxanaStatus,
  OxanaTask,
  OxanaTaskStatus,
} from '../../../types/oxana'
import { oxanaErrorMessage } from '../../../utils/oxanaErrors'

type TabId = 'chat' | 'tasks' | 'calendar' | 'projects' | 'notifications' | 'settings'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'chat', label: 'Чат' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'calendar', label: 'Календарь' },
  { id: 'projects', label: 'Проекты' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'settings', label: 'Настройки' },
]

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-60'

const TASK_STATUS_LABELS: Record<OxanaTaskStatus, string> = {
  open: 'Открыта',
  in_progress: 'В работе',
  done: 'Готово',
  cancelled: 'Отменена',
}

function useOxanaToken() {
  const { session } = useAuth()
  return session?.access_token ?? ''
}

export function AdminOxanaPage() {
  const [tab, setTab] = useState<TabId>('tasks')

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
            OXANA AI
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink md:text-2xl">
            ОКСИ
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Личный контур на российской инфраструктуре. Telegram и MAX подключим
            позже.
          </p>
        </div>
        <OxanaMascot className="w-full max-w-[18rem] sm:max-w-[20rem]" />
      </div>

      {!isOxanaApiConfigured() ? (
        <DataStatus error={oxanaErrorMessage('api_not_configured')} />
      ) : (
        <>
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            role="tablist"
            aria-label="Разделы ОКСИ"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  tab === item.id
                    ? 'border-accent/50 bg-soft font-medium text-ink'
                    : 'border-border text-muted hover:bg-soft/80 hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {tab === 'chat' ? <ChatPanel /> : null}
          {tab === 'tasks' ? <TasksPanel /> : null}
          {tab === 'calendar' ? <CalendarPanel /> : null}
          {tab === 'projects' ? <ProjectsPanel /> : null}
          {tab === 'notifications' ? <NotificationsPanel /> : null}
          {tab === 'settings' ? <SettingsPanel /> : null}
        </>
      )}
    </div>
  )
}

function ChatPanel() {
  const token = useOxanaToken()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim() || sending) {
      return
    }
    setSending(true)
    setNotice(null)
    const result = await sendOxanaChat(token, message.trim())
    setSending(false)
    setNotice(
      result.ok
        ? oxanaErrorMessage('ai_not_configured')
        : result.error,
    )
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">Чат</h2>
      <p className="mt-1 text-sm text-muted">
        Контракт API готов. Ответ модели не имитируется.
      </p>
      <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
        <textarea
          className={`${fieldClass} min-h-28 resize-y`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Напишите ОКСИ"
          maxLength={4000}
        />
        {notice ? (
          <p className="rounded-2xl border border-border bg-soft px-4 py-3 text-sm text-muted" role="status">
            {notice}
          </p>
        ) : null}
        <Button type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Отправка...' : 'Отправить'}
        </Button>
      </form>
    </section>
  )
}

function TasksPanel() {
  const token = useOxanaToken()
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<OxanaTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await fetchOxanaTasks(token)
    if (result.ok) {
      setTasks(result.data.tasks)
      setError(null)
    } else {
      setTasks([])
      setError(result.error)
    }
    setLoading(false)
  }, [token])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) {
      return
    }
    setSaving(true)
    const result = await createOxanaTask(token, {
      title: title.trim(),
      description: description.trim() || undefined,
      dueAt: dueAt || undefined,
    })
    setSaving(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTitle('')
    setDescription('')
    setDueAt('')
    setTasks((current) => [result.data.task, ...current])
    showToast('Задача создана', 'success')
  }

  const handleStatus = async (taskId: string, status: OxanaTaskStatus) => {
    const result = await updateOxanaTaskStatus(token, taskId, status)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? result.data.task : task)),
    )
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"
        onSubmit={(event) => void handleCreate(event)}
      >
        <h2 className="text-sm font-semibold text-ink">Новая задача</h2>
        <input
          className={fieldClass}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название"
          required
        />
        <textarea
          className={`${fieldClass} min-h-20 resize-y`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Описание, если нужно"
        />
        <input
          type="datetime-local"
          className={fieldClass}
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? 'Сохранение...' : 'Создать задачу'}
        </Button>
      </form>

      <DataStatus loading={loading} error={error} loadingText="Загрузка задач..." />

      <div className="space-y-3">
        {!loading && tasks.length === 0 && !error ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">
            Задач пока нет.
          </p>
        ) : null}
        {tasks.map((task) => (
          <article
            key={task.id}
            className="rounded-xl border border-border bg-surface px-4 py-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-ink">{task.title}</p>
                {task.description ? (
                  <p className="mt-1 text-sm text-muted">{task.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  {TASK_STATUS_LABELS[task.status]}
                  {task.dueAt ? ` · до ${formatAdminDateTime(task.dueAt)}` : ''}
                  {` · ${formatAdminDate(task.createdAt)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TASK_STATUS_LABELS) as OxanaTaskStatus[]).map(
                  (status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={task.status === status}
                      onClick={() => void handleStatus(task.id, status)}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:bg-soft hover:text-ink disabled:opacity-40"
                    >
                      {TASK_STATUS_LABELS[status]}
                    </button>
                  ),
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function ProjectsPanel() {
  const token = useOxanaToken()
  const { showToast } = useToast()
  const [projects, setProjects] = useState<OxanaProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await fetchOxanaProjects(token)
    if (result.ok) {
      setProjects(result.data.projects)
      setError(null)
    } else {
      setProjects([])
      setError(result.error)
    }
    setLoading(false)
  }, [token])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) {
      return
    }
    setSaving(true)
    const result = await createOxanaProject(token, {
      title: title.trim(),
      description: description.trim() || undefined,
    })
    setSaving(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTitle('')
    setDescription('')
    setProjects((current) => [result.data.project, ...current])
    showToast('Проект создан', 'success')
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"
        onSubmit={(event) => void handleCreate(event)}
      >
        <h2 className="text-sm font-semibold text-ink">Новый проект ОКСИ</h2>
        <input
          className={fieldClass}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название проекта"
          required
        />
        <textarea
          className={`${fieldClass} min-h-20 resize-y`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Краткое описание"
        />
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? 'Сохранение...' : 'Создать проект'}
        </Button>
      </form>

      <DataStatus
        loading={loading}
        error={error}
        loadingText="Загрузка проектов..."
      />

      <div className="space-y-3">
        {!loading && projects.length === 0 && !error ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">
            Проектов ОКСИ пока нет.
          </p>
        ) : null}
        {projects.map((project) => (
          <article
            key={project.id}
            className="rounded-xl border border-border bg-surface px-4 py-4"
          >
            <p className="font-medium text-ink">{project.title}</p>
            {project.description ? (
              <p className="mt-1 text-sm text-muted">{project.description}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              {project.status} · {formatAdminDate(project.createdAt)}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

function CalendarPanel() {
  const token = useOxanaToken()
  const [events, setEvents] = useState<OxanaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      const result = await fetchOxanaEvents(token)
      if (!active) return
      if (result.ok) {
        setEvents(result.data.events)
        setError(null)
      } else {
        setEvents([])
        setError(result.error)
      }
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">Календарь</h2>
      <p className="mt-1 text-sm text-muted">
        События читаются из российской базы. Создание и напоминания — на следующем
        этапе.
      </p>
      <div className="mt-4">
        <DataStatus
          loading={loading}
          error={error}
          loadingText="Загрузка событий..."
        />
        {!loading && events.length === 0 && !error ? (
          <p className="text-sm text-muted">Событий пока нет.</p>
        ) : null}
        <div className="space-y-3">
          {events.map((event) => (
            <article key={event.id} className="rounded-lg border border-border px-3 py-3">
              <p className="text-sm font-medium text-ink">{event.title}</p>
              <p className="mt-1 text-xs text-muted">
                {formatAdminDateTime(event.startsAt)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function NotificationsPanel() {
  const token = useOxanaToken()
  const [items, setItems] = useState<OxanaNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      const result = await fetchOxanaNotifications(token)
      if (!active) return
      if (result.ok) {
        setItems(result.data.notifications)
        setError(null)
      } else {
        setItems([])
        setError(result.error)
      }
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">Уведомления</h2>
      <p className="mt-1 text-sm text-muted">
        Каналы Telegram и MAX ещё не подключены. Лента читается из базы ОКСИ.
      </p>
      <div className="mt-4">
        <DataStatus
          loading={loading}
          error={error}
          loadingText="Загрузка уведомлений..."
        />
        {!loading && items.length === 0 && !error ? (
          <p className="text-sm text-muted">Уведомлений пока нет.</p>
        ) : null}
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-lg border border-border px-3 py-3">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              {item.body ? (
                <p className="mt-1 text-sm text-muted">{item.body}</p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function SettingsPanel() {
  const token = useOxanaToken()
  const [status, setStatus] = useState<OxanaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      const result = await fetchOxanaStatus(token)
      if (!active) return
      if (result.ok) {
        setStatus(result.data)
        setError(null)
      } else {
        setStatus(null)
        setError(result.error)
      }
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">Настройки</h2>
        <p className="mt-1 text-sm text-muted">
          Данные ОКСИ не пишутся в Supabase Cloud. Вход остаётся прежним.
        </p>
      </div>
      <DataStatus
        loading={loading}
        error={error}
        loadingText="Проверка российского API..."
      />
      {status ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-border px-3 py-3">
            <dt className="text-xs text-muted">Контур</dt>
            <dd className="mt-1 text-ink">{status.workspace.name}</dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            <dt className="text-xs text-muted">ИИ</dt>
            <dd className="mt-1 text-ink">
              {status.ai.provider} · не подключён
            </dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            <dt className="text-xs text-muted">Telegram</dt>
            <dd className="mt-1 text-ink">Следующий этап</dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            <dt className="text-xs text-muted">MAX</dt>
            <dd className="mt-1 text-ink">Следующий этап</dd>
          </div>
        </dl>
      ) : null}
    </section>
  )
}
