import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { OxanaMascot } from '../../../components/admin/oxana/OxanaMascot'
import { Button } from '../../../components/Button'
import { DataStatus } from '../../../components/DataStatus'
import { fetchOxanaOverview } from '../../../services/oxanaService'
import type { OxanaOverview } from '../../../types/oxana'
import { notificationTarget, visibleNotificationBody } from '../../../utils/oxanaRefs'
import { formatOxanaDate } from '../../../utils/oxanaTime'
import type { OxanaFocus } from './oxanaUi'
import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS } from './oxanaUi'

interface Props {
  token: string
  authLoading: boolean
  dateFormat: 'date' | 'datetime'
  onNavigate: (focus: OxanaFocus) => void
}

export function OxanaOverviewPanel({
  token,
  authLoading,
  dateFormat,
  onNavigate,
}: Props) {
  const [data, setData] = useState<OxanaOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (authLoading) return
    if (!token) {
      setLoading(false)
      setError('Сессия ещё не готова. Обновите страницу после входа.')
      return
    }
    setLoading(true)
    const result = await fetchOxanaOverview(token)
    if (result.ok) {
      setData(result.data)
      setError(null)
    } else {
      setData(null)
      setError(result.error)
    }
    setLoading(false)
  }, [authLoading, token])

  useEffect(() => {
    void reload()
  }, [reload])

  const name = data?.displayName?.trim() || 'Оксана'
  const timezone = data?.timezone || 'Europe/Moscow'

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Рабочая панель
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink">
            Здравствуйте, {name}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Живые данные из PostgreSQL ОКСИ. Показатели не выдуманы.
          </p>
        </div>
        <OxanaMascot className="w-full max-w-[14rem] sm:max-w-[16rem]" />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onNavigate({ tab: 'tasks' })}>
          Новая задача
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onNavigate({ tab: 'projects' })}
        >
          Новый проект
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onNavigate({ tab: 'calendar' })}
        >
          Новое событие
        </Button>
      </div>

      <DataStatus loading={loading} error={error} loadingText="Загрузка обзора..." />
      {error ? (
        <Button type="button" variant="secondary" onClick={() => void reload()}>
          Повторить
        </Button>
      ) : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <OverviewCard title="Задачи на сегодня" empty="На сегодня сроков нет.">
            {data.todayTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="block w-full rounded-lg border border-border px-3 py-2 text-left"
                onClick={() => onNavigate({ tab: 'tasks', taskId: task.id })}
              >
                <p className="text-sm font-medium text-ink">{task.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {TASK_STATUS_LABELS[task.status]}
                  {task.dueAt
                    ? ` · ${formatOxanaDate(task.dueAt, timezone, dateFormat)}`
                    : ''}
                </p>
              </button>
            ))}
          </OverviewCard>

          <OverviewCard title="Просроченные" empty="Просроченных задач нет.">
            {data.overdueTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="block w-full rounded-lg border border-red-300/60 bg-red-50/40 px-3 py-2 text-left dark:bg-red-950/20"
                onClick={() => onNavigate({ tab: 'tasks', taskId: task.id })}
              >
                <p className="text-sm font-medium text-ink">{task.title}</p>
                <p className="mt-1 text-xs text-muted">
                  до {formatOxanaDate(task.dueAt, timezone, dateFormat)}
                </p>
              </button>
            ))}
          </OverviewCard>

          <OverviewCard title="Ближайшие события" empty="Ближайших событий нет.">
            {data.upcomingEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className="block w-full rounded-lg border border-border px-3 py-2 text-left"
                onClick={() => onNavigate({ tab: 'calendar', eventId: event.id })}
              >
                <p className="text-sm font-medium text-ink">{event.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatOxanaDate(event.startsAt, timezone, dateFormat)}
                </p>
              </button>
            ))}
          </OverviewCard>

          <OverviewCard title="Активные проекты" empty="Активных проектов нет.">
            {data.activeProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="block w-full rounded-lg border border-border px-3 py-2 text-left"
                onClick={() =>
                  onNavigate({ tab: 'projects', projectId: project.id })
                }
              >
                <p className="text-sm font-medium text-ink">{project.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {PROJECT_STATUS_LABELS[project.status]}
                  {` · задач ${project.taskCount ?? 0}`}
                  {project.taskCount
                    ? ` · ${Math.round(((project.doneCount ?? 0) / project.taskCount) * 100)}%`
                    : ''}
                </p>
              </button>
            ))}
          </OverviewCard>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">Выполнение</h3>
            <p className="mt-3 text-3xl font-semibold text-ink">
              {data.completionPercent}%
            </p>
            <p className="mt-1 text-sm text-muted">
              Доля задач со статусом «Готово».
            </p>
          </section>

          <OverviewCard
            title={`Последние уведомления${data.unreadCount ? ` · ${data.unreadCount}` : ''}`}
            empty="Уведомлений пока нет."
          >
            {data.latestNotifications.map((item) => {
              const ref = notificationTarget(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full rounded-lg border border-border px-3 py-2 text-left"
                  onClick={() => {
                    if (ref?.kind === 'task') {
                      onNavigate({ tab: 'tasks', taskId: ref.id })
                      return
                    }
                    if (ref?.kind === 'event') {
                      onNavigate({ tab: 'calendar', eventId: ref.id })
                      return
                    }
                    if (ref?.kind === 'project') {
                      onNavigate({ tab: 'projects', projectId: ref.id })
                      return
                    }
                    onNavigate({ tab: 'notifications' })
                  }}
                >
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  {visibleNotificationBody(item.body) ? (
                    <p className="mt-1 text-xs text-muted">
                      {visibleNotificationBody(item.body)}
                    </p>
                  ) : null}
                </button>
              )
            })}
          </OverviewCard>
        </div>
      ) : null}
    </div>
  )
}

function OverviewCard({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: ReactNode
}) {
  const items = Array.isArray(children) ? children : [children]
  const hasItems = items.filter(Boolean).length > 0
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-3 space-y-2">
        {hasItems ? children : <p className="text-sm text-muted">{empty}</p>}
      </div>
    </section>
  )
}
