import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DataStatus } from '../../../components/DataStatus'
import { useToast } from '../../../components/ToastProvider'
import {
  createOxanaTask,
  deleteOxanaTask,
  fetchOxanaProjects,
  fetchOxanaTasks,
  updateOxanaTask,
  updateOxanaTaskStatus,
} from '../../../services/oxanaService'
import type {
  OxanaProject,
  OxanaTask,
  OxanaTaskPriority,
  OxanaTaskStatus,
} from '../../../types/oxana'
import { formatOxanaDate, fromDateTimeLocal, toDateTimeLocal } from '../../../utils/oxanaTime'
import type { OxanaFocus } from './oxanaUi'
import {
  isArchivedTask,
  OXANA_CHIP_CLASS,
  OXANA_FIELD_CLASS,
  OXANA_TEXTAREA_CLASS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from './oxanaUi'

type DueFilter = 'all' | 'today' | 'overdue' | 'upcoming' | 'none'

interface Props {
  token: string
  authLoading: boolean
  timezone: string
  dateFormat: 'date' | 'datetime'
  focusTaskId?: string
  onNavigate: (focus: OxanaFocus) => void
}

export function OxanaTasksPanel({
  token,
  authLoading,
  timezone,
  dateFormat,
  focusTaskId,
  onNavigate,
}: Props) {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<OxanaTask[]>([])
  const [projects, setProjects] = useState<OxanaProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [projectId, setProjectId] = useState('')
  const [priority, setPriority] = useState<OxanaTaskPriority>('normal')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<OxanaTaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<OxanaTaskPriority | 'all'>('all')
  const [dueFilter, setDueFilter] = useState<DueFilter>('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [showArchive, setShowArchive] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDueAt, setEditDueAt] = useState('')
  const [editPriority, setEditPriority] = useState<OxanaTaskPriority>('normal')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const reload = useCallback(async () => {
    if (authLoading) return
    if (!token) {
      setLoading(false)
      setError('Сессия ещё не готова. Обновите страницу после входа.')
      return
    }
    setLoading(true)
    const [taskResult, projectResult] = await Promise.all([
      fetchOxanaTasks(token),
      fetchOxanaProjects(token),
    ])
    if (taskResult.ok) {
      setTasks(taskResult.data.tasks)
      setError(null)
    } else {
      setTasks([])
      setError(taskResult.error)
    }
    if (projectResult.ok) {
      setProjects(projectResult.data.projects)
    }
    setLoading(false)
  }, [authLoading, token])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!focusTaskId) return
    const focused = tasks.find((task) => task.id === focusTaskId)
    if (focused && isArchivedTask(focused)) {
      setShowArchive(true)
    }
  }, [focusTaskId, tasks])

  const visible = useMemo(() => {
    const now = Date.now()
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return tasks.filter((task) => {
      if (!showArchive && isArchivedTask(task)) return false
      if (showArchive && !isArchivedTask(task)) return false
      if (statusFilter !== 'all' && task.status !== statusFilter) return false
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false
      if (projectFilter === 'personal' && task.projectId) return false
      if (
        projectFilter !== 'all' &&
        projectFilter !== 'personal' &&
        task.projectId !== projectFilter
      ) {
        return false
      }
      if (query.trim() && !task.title.toLowerCase().includes(query.trim().toLowerCase())) {
        return false
      }
      if (dueFilter === 'none') return !task.dueAt
      if (dueFilter === 'overdue') {
        return Boolean(task.dueAt) && new Date(task.dueAt as string).getTime() < now && !isArchivedTask(task)
      }
      if (dueFilter === 'today') {
        if (!task.dueAt) return false
        const due = new Date(task.dueAt).getTime()
        return due >= start.getTime() && due < end.getTime()
      }
      if (dueFilter === 'upcoming') {
        return Boolean(task.dueAt) && new Date(task.dueAt as string).getTime() >= now
      }
      return true
    })
  }, [dueFilter, priorityFilter, projectFilter, query, showArchive, statusFilter, tasks])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await createOxanaTask(token, {
      title: title.trim(),
      description: description.trim() || undefined,
      dueAt: fromDateTimeLocal(dueAt, timezone),
      projectId: projectId || undefined,
      priority,
    })
    setSaving(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTitle('')
    setDescription('')
    setDueAt('')
    setProjectId('')
    setPriority('normal')
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

  const handleProjectChange = async (taskId: string, nextProjectId: string) => {
    const result = await updateOxanaTask(token, taskId, {
      projectId: nextProjectId || null,
    })
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? result.data.task : task)),
    )
    showToast('Проект задачи обновлён', 'success')
  }

  const startEdit = (task: OxanaTask) => {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDescription(task.description ?? '')
    setEditDueAt(toDateTimeLocal(task.dueAt, timezone))
    setEditPriority(task.priority || 'normal')
  }

  const handleSaveEdit = async (taskId: string) => {
    const result = await updateOxanaTask(token, taskId, {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      dueAt: fromDateTimeLocal(editDueAt, timezone) ?? null,
      priority: editPriority,
    })
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? result.data.task : task)),
    )
    setEditingId(null)
    showToast('Задача обновлена', 'success')
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const result = await deleteOxanaTask(token, deleteId)
    setDeleting(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTasks((current) => current.filter((task) => task.id !== deleteId))
    setDeleteId(null)
    showToast('Задача удалена', 'success')
  }

  const handleArchive = async (task: OxanaTask) => {
    const result = await updateOxanaTask(token, task.id, {
      archivedAt: task.archivedAt ? null : new Date().toISOString(),
    })
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? result.data.task : item)),
    )
    showToast(task.archivedAt ? 'Задача восстановлена' : 'Задача в архиве', 'success')
  }

  return (
    <div className="space-y-3">
      <form
        className="space-y-2.5 rounded-[1.125rem] border border-border bg-surface p-4"
        onSubmit={(event) => void handleCreate(event)}
      >
        <h2 className="text-sm font-semibold text-ink">Новая задача</h2>
        <input
          className={OXANA_FIELD_CLASS}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название"
          required
        />
        <textarea
          className={OXANA_TEXTAREA_CLASS}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Описание, если нужно"
        />
        <div className="grid gap-2.5 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Проект</span>
            <select
              className={OXANA_FIELD_CLASS}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Личная задача — без проекта</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Приоритет</span>
            <select
              className={OXANA_FIELD_CLASS}
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as OxanaTaskPriority)
              }
            >
              {(Object.keys(TASK_PRIORITY_LABELS) as OxanaTaskPriority[]).map(
                (item) => (
                  <option key={item} value={item}>
                    {TASK_PRIORITY_LABELS[item]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Срок</span>
            <input
              type="datetime-local"
              className={OXANA_FIELD_CLASS}
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
        </div>
        <Button type="submit" size="sm" disabled={saving || !title.trim()}>
          {saving ? 'Сохранение...' : 'Создать задачу'}
        </Button>
      </form>

      <section className="space-y-2.5 rounded-[1.125rem] border border-border bg-surface p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input
            className={OXANA_FIELD_CLASS}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию"
          />
          <select
            className={OXANA_FIELD_CLASS}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as OxanaTaskStatus | 'all')
            }
          >
            <option value="all">Все статусы</option>
            {(Object.keys(TASK_STATUS_LABELS) as OxanaTaskStatus[]).map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            className={OXANA_FIELD_CLASS}
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value as OxanaTaskPriority | 'all')
            }
          >
            <option value="all">Все приоритеты</option>
            {(Object.keys(TASK_PRIORITY_LABELS) as OxanaTaskPriority[]).map(
              (item) => (
                <option key={item} value={item}>
                  {TASK_PRIORITY_LABELS[item]}
                </option>
              ),
            )}
          </select>
          <select
            className={OXANA_FIELD_CLASS}
            value={dueFilter}
            onChange={(event) => setDueFilter(event.target.value as DueFilter)}
          >
            <option value="all">Любой срок</option>
            <option value="today">Сегодня</option>
            <option value="overdue">Просрочено</option>
            <option value="upcoming">Предстоящие</option>
            <option value="none">Без срока</option>
          </select>
          <select
            className={OXANA_FIELD_CLASS}
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="all">Все проекты</option>
            <option value="personal">Личные</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showArchive}
            onChange={(event) => setShowArchive(event.target.checked)}
          />
          Показать архив
        </label>
      </section>

      <DataStatus loading={loading} error={error} loadingText="Загрузка задач..." />
      {error ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => void reload()}>
          Повторить
        </Button>
      ) : null}

      <div className="space-y-2">
        {!loading && visible.length === 0 && !error ? (
          <p className="rounded-[1.125rem] border border-border bg-surface px-4 py-4 text-sm text-muted">
            Задач по выбранным фильтрам нет.
          </p>
        ) : null}
        {visible.map((task) => {
          const overdue =
            Boolean(task.dueAt) &&
            new Date(task.dueAt as string).getTime() < Date.now() &&
            !isArchivedTask(task)
          const focused = task.id === focusTaskId
          return (
            <article
              key={task.id}
              id={`oxana-task-${task.id}`}
              className={`rounded-[1.125rem] border bg-surface px-4 py-3 ${
                focused ? 'border-accent/60' : overdue ? 'border-red-400/50' : 'border-border'
              }`}
            >
              {editingId === task.id ? (
                <div className="space-y-2.5">
                  <input
                    className={OXANA_FIELD_CLASS}
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                  />
                  <textarea
                    className={OXANA_TEXTAREA_CLASS}
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                  <select
                    className={OXANA_FIELD_CLASS}
                    value={editPriority}
                    onChange={(event) =>
                      setEditPriority(event.target.value as OxanaTaskPriority)
                    }
                  >
                    {(Object.keys(TASK_PRIORITY_LABELS) as OxanaTaskPriority[]).map(
                      (item) => (
                        <option key={item} value={item}>
                          {TASK_PRIORITY_LABELS[item]}
                        </option>
                      ),
                    )}
                  </select>
                  <input
                    type="datetime-local"
                    className={OXANA_FIELD_CLASS}
                    value={editDueAt}
                    onChange={(event) => setEditDueAt(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveEdit(task.id)}
                      disabled={!editTitle.trim()}
                    >
                      Сохранить
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{task.title}</p>
                    {task.description ? (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{task.description}</p>
                    ) : null}
                    <p className="mt-1.5 text-xs text-muted">
                      {task.projectTitle || 'Личная задача'}
                      {` · ${TASK_STATUS_LABELS[task.status]}`}
                      {` · ${TASK_PRIORITY_LABELS[task.priority || 'normal']}`}
                      {task.dueAt
                        ? ` · до ${formatOxanaDate(task.dueAt, timezone, dateFormat)}`
                        : ''}
                      {overdue ? ' · просрочена' : ''}
                      {task.archivedAt ? ' · в архиве' : ''}
                    </p>
                    <label className="mt-1.5 block max-w-xs">
                      <span className="sr-only">Проект</span>
                      <select
                        className={OXANA_FIELD_CLASS}
                        value={task.projectId ?? ''}
                        aria-label="Проект"
                        onChange={(event) =>
                          void handleProjectChange(task.id, event.target.value)
                        }
                      >
                        <option value="">Личная задача — без проекта</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {task.projectId ? (
                      <button
                        type="button"
                        className="mt-2 text-xs text-accent hover:underline"
                        onClick={() =>
                          onNavigate({ tab: 'projects', projectId: task.projectId ?? undefined })
                        }
                      >
                        Открыть проект
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(TASK_STATUS_LABELS) as OxanaTaskStatus[]).map(
                      (status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={task.status === status}
                          onClick={() => void handleStatus(task.id, status)}
                          className={OXANA_CHIP_CLASS}
                        >
                          {TASK_STATUS_LABELS[status]}
                        </button>
                      ),
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleArchive(task)}
                    >
                      {task.archivedAt ? 'Восстановить' : 'В архив'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => startEdit(task)}
                    >
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteId(task.id)}
                    >
                      Удалить
                    </Button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Удалить задачу?"
        description="Задача будет удалена из рабочего пространства ОКСИ. Это действие нельзя отменить."
        confirming={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
