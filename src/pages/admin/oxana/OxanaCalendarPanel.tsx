import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DataStatus } from '../../../components/DataStatus'
import { useToast } from '../../../components/ToastProvider'
import {
  createOxanaEvent,
  deleteOxanaEvent,
  fetchOxanaEvents,
  fetchOxanaProjects,
  fetchOxanaTasks,
  updateOxanaEvent,
} from '../../../services/oxanaService'
import type { OxanaEvent, OxanaProject, OxanaTask } from '../../../types/oxana'
import {
  addDays,
  formatOxanaDate,
  formatOxanaMonthTitle,
  fromDateTimeLocal,
  isSameZonedDay,
  startOfZonedDay,
  toDateTimeLocal,
  zonedDate,
  zonedParts,
} from '../../../utils/oxanaTime'
import { isArchivedTask, OXANA_FIELD_CLASS } from './oxanaUi'
import type { OxanaFocus } from './oxanaUi'

type ViewMode = 'month' | 'week' | 'day'

interface CalendarItem {
  id: string
  kind: 'task' | 'event'
  title: string
  at: string
  end: string | null
  overdue: boolean
}

interface Props {
  token: string
  authLoading: boolean
  timezone: string
  dateFormat: 'date' | 'datetime'
  focusEventId?: string
  onNavigate: (focus: OxanaFocus) => void
}

export function OxanaCalendarPanel({
  token,
  authLoading,
  timezone,
  dateFormat,
  focusEventId,
  onNavigate,
}: Props) {
  const { showToast } = useToast()
  const [mode, setMode] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [events, setEvents] = useState<OxanaEvent[]>([])
  const [tasks, setTasks] = useState<OxanaTask[]>([])
  const [projects, setProjects] = useState<OxanaProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<OxanaEvent | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [editStartsAt, setEditStartsAt] = useState('')
  const [editEndsAt, setEditEndsAt] = useState('')
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
    const [eventResult, taskResult, projectResult] = await Promise.all([
      fetchOxanaEvents(token),
      fetchOxanaTasks(token),
      fetchOxanaProjects(token),
    ])
    if (eventResult.ok && taskResult.ok) {
      setEvents(eventResult.data.events)
      setTasks(taskResult.data.tasks)
      setError(null)
    } else if (!eventResult.ok) {
      setError(eventResult.error)
    } else if (!taskResult.ok) {
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
    if (!focusEventId) return
    const found = events.find((event) => event.id === focusEventId)
    if (found) {
      setSelectedEvent(found)
      setEditTitle(found.title)
      setEditDescription(found.description ?? '')
      setEditProjectId(found.projectId ?? '')
      setEditStartsAt(toDateTimeLocal(found.startsAt, timezone))
      setEditEndsAt(toDateTimeLocal(found.endsAt, timezone))
      setCursor(new Date(found.startsAt))
    }
  }, [events, focusEventId, timezone])

  const items = useMemo<CalendarItem[]>(() => {
    const eventItems = events.map((event) => ({
      id: event.id,
      kind: 'event' as const,
      title: event.title,
      at: event.startsAt,
      end: event.endsAt,
      overdue: false,
    }))
    const taskItems = tasks
      .filter((task) => task.dueAt && !isArchivedTask(task))
      .map((task) => ({
        id: task.id,
        kind: 'task' as const,
        title: task.title,
        at: task.dueAt as string,
        end: null,
        overdue:
          new Date(task.dueAt as string).getTime() < Date.now() &&
          !isArchivedTask(task),
      }))
    return [...eventItems, ...taskItems]
  }, [events, tasks])

  const days = useMemo(() => calendarDays(cursor, mode, timezone), [cursor, mode, timezone])
  const selectedDayItems = items.filter((item) =>
    isSameZonedDay(new Date(item.at), cursor, timezone),
  )

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const starts = fromDateTimeLocal(startsAt, timezone)
    if (!starts) {
      showToast('Укажите начало события', 'error')
      return
    }
    setSaving(true)
    const result = await createOxanaEvent(token, {
      title: title.trim(),
      description: description.trim() || undefined,
      startsAt: starts,
      endsAt: fromDateTimeLocal(endsAt, timezone),
      projectId: projectId || undefined,
    })
    setSaving(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setTitle('')
    setDescription('')
    setProjectId('')
    setStartsAt('')
    setEndsAt('')
    setEvents((current) =>
      [...current, result.data.event].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    )
    showToast('Событие создано', 'success')
  }

  const handleSaveEvent = async () => {
    if (!selectedEvent) return
    const starts = fromDateTimeLocal(editStartsAt, timezone)
    if (!starts) {
      showToast('Укажите начало события', 'error')
      return
    }
    const result = await updateOxanaEvent(token, selectedEvent.id, {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      startsAt: starts,
      endsAt: fromDateTimeLocal(editEndsAt, timezone) ?? null,
      projectId: editProjectId || null,
    })
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setEvents((current) =>
      current.map((item) => (item.id === selectedEvent.id ? result.data.event : item)),
    )
    setSelectedEvent(result.data.event)
    showToast('Событие обновлено', 'success')
  }

  const handleDelete = async () => {
    if (!selectedEvent) return
    setDeleting(true)
    const result = await deleteOxanaEvent(token, selectedEvent.id)
    setDeleting(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setEvents((current) => current.filter((item) => item.id !== selectedEvent.id))
    setSelectedEvent(null)
    setDeleteOpen(false)
    showToast('Событие удалено', 'success')
  }

  const openItem = (item: CalendarItem) => {
    if (item.kind === 'task') {
      onNavigate({ tab: 'tasks', taskId: item.id })
      return
    }
    const event = events.find((row) => row.id === item.id)
    if (!event) return
    setSelectedEvent(event)
    setEditTitle(event.title)
    setEditDescription(event.description ?? '')
    setEditProjectId(event.projectId ?? '')
    setEditStartsAt(toDateTimeLocal(event.startsAt, timezone))
    setEditEndsAt(toDateTimeLocal(event.endsAt, timezone))
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"
        onSubmit={(event) => void handleCreate(event)}
      >
        <h2 className="text-sm font-semibold text-ink">Новое событие</h2>
        <input
          className={OXANA_FIELD_CLASS}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название встречи или события"
          required
        />
        <textarea
          className={`${OXANA_FIELD_CLASS} min-h-20 resize-y`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Описание, если нужно"
        />
        <label className="block space-y-1.5">
          <span className="text-xs text-muted">Проект</span>
          <select
            className={OXANA_FIELD_CLASS}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Без проекта</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Начало</span>
            <input
              type="datetime-local"
              className={OXANA_FIELD_CLASS}
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Окончание</span>
            <input
              type="datetime-local"
              className={OXANA_FIELD_CLASS}
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>
        </div>
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? 'Сохранение...' : 'Создать событие'}
        </Button>
      </form>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Календарь ОКСИ</h2>
            <p className="mt-1 text-sm text-muted">
              {formatOxanaMonthTitle(cursor, timezone)} · {timezone}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['month', 'week', 'day'] as ViewMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  mode === item
                    ? 'border-accent/50 bg-soft text-ink'
                    : 'border-border text-muted'
                }`}
              >
                {item === 'month' ? 'Месяц' : item === 'week' ? 'Неделя' : 'День'}
              </button>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => shiftCursor(cursor, mode, -1, timezone, setCursor)}
            >
              Назад
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCursor(new Date())}>
              Сегодня
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => shiftCursor(cursor, mode, 1, timezone, setCursor)}
            >
              Вперёд
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <DataStatus loading={loading} error={error} loadingText="Загрузка календаря..." />
          {error ? (
            <Button type="button" variant="secondary" onClick={() => void reload()}>
              Повторить
            </Button>
          ) : null}
        </div>

        <div
          className={`mt-4 grid gap-2 ${
            mode === 'day' ? 'grid-cols-1' : 'grid-cols-7'
          }`}
        >
          {mode !== 'day'
            ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label) => (
                <p key={label} className="hidden text-center text-[11px] text-muted sm:block">
                  {label}
                </p>
              ))
            : null}
          {days.map((day) => {
            const dayItems = items.filter((item) =>
              isSameZonedDay(new Date(item.at), day, timezone),
            )
            const selected = isSameZonedDay(day, cursor, timezone)
            const today = isSameZonedDay(day, new Date(), timezone)
            const inMonth = zonedParts(day, timezone).month === zonedParts(cursor, timezone).month
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setCursor(day)}
                className={`min-h-24 rounded-lg border px-2 py-2 text-left ${
                  selected
                    ? 'border-accent/50 bg-soft'
                    : 'border-border bg-bg/40'
                } ${inMonth || mode !== 'month' ? '' : 'opacity-45'}`}
              >
                <p className={`text-xs ${today ? 'font-semibold text-ink' : 'text-muted'}`}>
                  {zonedParts(day, timezone).day}
                </p>
                <div className="mt-1 space-y-1">
                  {dayItems.slice(0, mode === 'month' ? 3 : 8).map((item) => (
                    <span
                      key={`${item.kind}-${item.id}`}
                      role="presentation"
                      onClick={(event) => {
                        event.stopPropagation()
                        openItem(item)
                      }}
                      className={`block truncate rounded px-1.5 py-0.5 text-[11px] ${itemClass(item)}`}
                    >
                      {item.title}
                    </span>
                  ))}
                  {dayItems.length > (mode === 'month' ? 3 : 8) ? (
                    <p className="text-[11px] text-muted">+{dayItems.length - 3}</p>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-ink">
            {formatOxanaDate(cursor.toISOString(), timezone, 'date')}
          </h3>
          {selectedDayItems.length === 0 ? (
            <p className="text-sm text-muted">На этот день задач и событий нет.</p>
          ) : null}
          {selectedDayItems.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              className={`block w-full rounded-lg border px-3 py-2 text-left ${itemClass(item)}`}
              onClick={() => openItem(item)}
            >
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs opacity-80">
                {item.kind === 'task' ? 'Задача' : 'Событие'} ·{' '}
                {formatOxanaDate(item.at, timezone, dateFormat)}
              </p>
            </button>
          ))}
        </div>
      </section>

      {selectedEvent ? (
        <section className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-ink">Карточка события</h3>
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
          <select
            className={OXANA_FIELD_CLASS}
            value={editProjectId}
            onChange={(event) => setEditProjectId(event.target.value)}
          >
            <option value="">Без проекта</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          {selectedEvent.projectTitle ? (
            <p className="text-xs text-muted">Проект: {selectedEvent.projectTitle}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="datetime-local"
              className={OXANA_FIELD_CLASS}
              value={editStartsAt}
              onChange={(event) => setEditStartsAt(event.target.value)}
            />
            <input
              type="datetime-local"
              className={OXANA_FIELD_CLASS}
              value={editEndsAt}
              onChange={(event) => setEditEndsAt(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleSaveEvent()}>
              Сохранить
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(true)}>
              Удалить
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelectedEvent(null)}
            >
              Закрыть
            </Button>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        title="Удалить событие?"
        description="Событие исчезнет из календаря ОКСИ. Задачи при этом не изменятся."
        confirming={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}

function itemClass(item: CalendarItem): string {
  if (item.overdue) {
    return 'border-red-300/70 bg-red-50 text-red-800'
  }
  if (item.kind === 'event') {
    return 'border-violet-300/70 bg-violet-50 text-violet-900'
  }
  return 'border-sky-300/70 bg-sky-50 text-sky-900'
}

function calendarDays(cursor: Date, mode: ViewMode, timeZone: string): Date[] {
  const parts = zonedParts(cursor, timeZone)
  if (mode === 'day') {
    return [startOfZonedDay(cursor, timeZone)]
  }
  if (mode === 'week') {
    const start = startOfWeek(cursor, timeZone)
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }
  const first = zonedDate(parts.year, parts.month, 1, 0, 0, timeZone)
  const start = startOfWeek(first, timeZone)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

function startOfWeek(date: Date, timeZone: string): Date {
  const start = startOfZonedDay(date, timeZone)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(start)
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }
  const offset = map[weekday] ?? 0
  return addDays(start, -offset)
}

function shiftCursor(
  cursor: Date,
  mode: ViewMode,
  direction: number,
  timeZone: string,
  setCursor: (date: Date) => void,
) {
  if (mode === 'day') {
    setCursor(addDays(cursor, direction))
    return
  }
  if (mode === 'week') {
    setCursor(addDays(cursor, direction * 7))
    return
  }
  const parts = zonedParts(cursor, timeZone)
  const nextMonth = parts.month + direction
  const year = parts.year + (nextMonth < 1 ? -1 : nextMonth > 12 ? 1 : 0)
  const month = nextMonth < 1 ? 12 : nextMonth > 12 ? 1 : nextMonth
  setCursor(zonedDate(year, month, 1, 0, 0, timeZone))
}
