import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DataStatus } from '../../../components/DataStatus'
import { useToast } from '../../../components/ToastProvider'
import {
  createOxanaProject,
  deleteOxanaProject,
  fetchOxanaProject,
  fetchOxanaProjects,
  updateOxanaProject,
} from '../../../services/oxanaService'
import type {
  OxanaProject,
  OxanaProjectStatus,
  OxanaTask,
} from '../../../types/oxana'
import { formatOxanaDate, fromDateTimeLocal, toDateTimeLocal } from '../../../utils/oxanaTime'
import type { OxanaFocus } from './oxanaUi'
import {
  OXANA_FIELD_CLASS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  isArchivedTask,
} from './oxanaUi'

interface Props {
  token: string
  authLoading: boolean
  timezone: string
  dateFormat: 'date' | 'datetime'
  focusProjectId?: string
  onNavigate: (focus: OxanaFocus) => void
}

export function OxanaProjectsPanel({
  token,
  authLoading,
  timezone,
  dateFormat,
  focusProjectId,
  onNavigate,
}: Props) {
  const { showToast } = useToast()
  const [projects, setProjects] = useState<OxanaProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<OxanaProjectStatus>('planned')
  const [startsAt, setStartsAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(focusProjectId ?? null)
  const [detail, setDetail] = useState<{
    project: OxanaProject
    tasks: OxanaTask[]
  } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState<OxanaProjectStatus>('active')
  const [editStartsAt, setEditStartsAt] = useState('')
  const [editDueAt, setEditDueAt] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const reload = useCallback(async () => {
    if (authLoading) return
    if (!token) {
      setLoading(false)
      setError('Сессия ещё не готова. Обновите страницу после входа.')
      return
    }
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
  }, [authLoading, token])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (focusProjectId) {
      setSelectedId(focusProjectId)
    }
  }, [focusProjectId])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailError(null)
      return
    }
    let active = true
    const load = async () => {
      setDetailLoading(true)
      const result = await fetchOxanaProject(token, selectedId)
      if (!active) return
      if (result.ok) {
        setDetail({ project: result.data.project, tasks: result.data.tasks })
        setEditTitle(result.data.project.title)
        setEditDescription(result.data.project.description ?? '')
        setEditStatus(result.data.project.status)
        setEditStartsAt(toDateTimeLocal(result.data.project.startsAt, timezone))
        setEditDueAt(toDateTimeLocal(result.data.project.dueAt, timezone))
        setDetailError(null)
      } else {
        setDetail(null)
        setDetailError(result.error)
      }
      setDetailLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [selectedId, timezone, token])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await createOxanaProject(token, {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      startsAt: fromDateTimeLocal(startsAt, timezone),
      dueAt: fromDateTimeLocal(dueAt, timezone),
    })
    setSaving(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTitle('')
    setDescription('')
    setStatus('planned')
    setStartsAt('')
    setDueAt('')
    setProjects((current) => [result.data.project, ...current])
    showToast('Проект создан', 'success')
  }

  const handleSave = async () => {
    if (!selectedId) return
    const result = await updateOxanaProject(token, selectedId, {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      status: editStatus,
      startsAt: fromDateTimeLocal(editStartsAt, timezone) ?? null,
      dueAt: fromDateTimeLocal(editDueAt, timezone) ?? null,
    })
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setDetail((current) =>
      current ? { ...current, project: result.data.project } : current,
    )
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedId ? result.data.project : project,
      ),
    )
    showToast('Проект обновлён', 'success')
  }

  const handleDelete = async () => {
    if (!selectedId) return
    setDeleting(true)
    const result = await deleteOxanaProject(token, selectedId)
    setDeleting(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setProjects((current) => current.filter((project) => project.id !== selectedId))
    setSelectedId(null)
    setDeleteOpen(false)
    showToast('Проект удалён. Связанные задачи стали личными.', 'success')
  }

  if (selectedId) {
    const overdueTasks =
      detail?.tasks.filter(
        (task) =>
          Boolean(task.dueAt) &&
          new Date(task.dueAt as string).getTime() < Date.now() &&
          !isArchivedTask(task),
      ) ?? []
    const progress =
      detail && (detail.project.taskCount || detail.tasks.length)
        ? Math.round(
            ((detail.project.doneCount ??
              detail.tasks.filter((task) => task.status === 'done').length) /
              (detail.project.taskCount || detail.tasks.length)) *
              100,
          )
        : 0

    return (
      <div className="space-y-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSelectedId(null)}
        >
          К списку проектов
        </Button>
        <DataStatus
          loading={detailLoading}
          error={detailError}
          loadingText="Загрузка проекта..."
        />
        {detail ? (
          <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <div className="grid gap-3">
              <input
                className={OXANA_FIELD_CLASS}
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
              <textarea
                className={`${OXANA_FIELD_CLASS} min-h-20 resize-y`}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs text-muted">Начало</span>
                  <input
                    type="datetime-local"
                    className={OXANA_FIELD_CLASS}
                    value={editStartsAt}
                    onChange={(event) => setEditStartsAt(event.target.value)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs text-muted">Завершение</span>
                  <input
                    type="datetime-local"
                    className={OXANA_FIELD_CLASS}
                    value={editDueAt}
                    onChange={(event) => setEditDueAt(event.target.value)}
                  />
                </label>
              </div>
              <select
                className={OXANA_FIELD_CLASS}
                value={editStatus}
                onChange={(event) =>
                  setEditStatus(event.target.value as OxanaProjectStatus)
                }
              >
                {(Object.keys(PROJECT_STATUS_LABELS) as OxanaProjectStatus[]).map(
                  (status) => (
                    <option key={status} value={status}>
                      {PROJECT_STATUS_LABELS[status]}
                    </option>
                  ),
                )}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleSave()}>
                  Сохранить
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteOpen(true)}
                >
                  Удалить проект
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted">
              Задач: {detail.project.taskCount ?? detail.tasks.length} · прогресс{' '}
              {progress}% · просрочено {detail.project.overdueCount ?? overdueTasks.length}
            </p>
            {overdueTasks.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">Просроченные задачи</h3>
                {overdueTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="block w-full rounded-lg border border-red-300/70 px-3 py-2 text-left"
                    onClick={() => onNavigate({ tab: 'tasks', taskId: task.id })}
                  >
                    <p className="text-sm font-medium text-ink">{task.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      до {formatOxanaDate(task.dueAt, timezone, dateFormat)}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">Задачи проекта</h3>
              {detail.tasks.length === 0 ? (
                <p className="text-sm text-muted">У этого проекта пока нет задач.</p>
              ) : null}
              {detail.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="block w-full rounded-lg border border-border px-3 py-3 text-left"
                  onClick={() => onNavigate({ tab: 'tasks', taskId: task.id })}
                >
                  <p className="text-sm font-medium text-ink">{task.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {TASK_STATUS_LABELS[task.status]}
                    {task.dueAt
                      ? ` · срок ${formatOxanaDate(task.dueAt, timezone, dateFormat)}`
                      : ' · срок не указан'}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <ConfirmDialog
          open={deleteOpen}
          title="Удалить проект?"
          description="Связанные задачи не будут удалены: они останутся личными."
          confirming={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"
        onSubmit={(event) => void handleCreate(event)}
      >
        <h2 className="text-sm font-semibold text-ink">Новый проект ОКСИ</h2>
        <input
          className={OXANA_FIELD_CLASS}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название проекта"
          required
        />
        <textarea
          className={`${OXANA_FIELD_CLASS} min-h-20 resize-y`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Краткое описание"
        />
        <select
          className={OXANA_FIELD_CLASS}
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as OxanaProjectStatus)
          }
        >
          {(Object.keys(PROJECT_STATUS_LABELS) as OxanaProjectStatus[]).map(
            (item) => (
              <option key={item} value={item}>
                {PROJECT_STATUS_LABELS[item]}
              </option>
            ),
          )}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Начало</span>
            <input
              type="datetime-local"
              className={OXANA_FIELD_CLASS}
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Завершение</span>
            <input
              type="datetime-local"
              className={OXANA_FIELD_CLASS}
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
        </div>
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? 'Сохранение...' : 'Создать проект'}
        </Button>
      </form>

      <DataStatus loading={loading} error={error} loadingText="Загрузка проектов..." />
      {error ? (
        <Button type="button" variant="secondary" onClick={() => void reload()}>
          Повторить
        </Button>
      ) : null}

      <div className="space-y-3">
        {!loading && projects.length === 0 && !error ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">
            Проектов ОКСИ пока нет.
          </p>
        ) : null}
        {projects.map((project) => {
          const progress = project.taskCount
            ? Math.round(((project.doneCount ?? 0) / project.taskCount) * 100)
            : 0
          return (
            <article
              key={project.id}
              className="rounded-xl border border-border bg-surface px-4 py-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-ink">{project.title}</p>
                  {project.description ? (
                    <p className="mt-1 text-sm text-muted">{project.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted">
                    {PROJECT_STATUS_LABELS[project.status]} · задач{' '}
                    {project.taskCount ?? 0} · прогресс {progress}%
                    {project.startsAt
                      ? ` · с ${formatOxanaDate(project.startsAt, timezone, 'date')}`
                      : ''}
                    {project.dueAt
                      ? ` · до ${formatOxanaDate(project.dueAt, timezone, 'date')}`
                      : ''}
                    {project.overdueCount
                      ? ` · просрочено ${project.overdueCount}`
                      : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedId(project.id)}
                >
                  Открыть
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
