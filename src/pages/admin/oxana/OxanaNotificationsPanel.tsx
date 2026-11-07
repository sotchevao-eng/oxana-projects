import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/Button'
import { DataStatus } from '../../../components/DataStatus'
import { useToast } from '../../../components/ToastProvider'
import {
  fetchOxanaNotifications,
  markAllOxanaNotificationsRead,
  markOxanaNotificationRead,
} from '../../../services/oxanaService'
import type { OxanaNotification } from '../../../types/oxana'
import { notificationTarget, visibleNotificationBody } from '../../../utils/oxanaRefs'
import { formatOxanaDate } from '../../../utils/oxanaTime'
import {
  OXANA_CHIP_ACTIVE_CLASS,
  OXANA_CHIP_CLASS,
  type OxanaFocus,
} from './oxanaUi'

interface Props {
  token: string
  authLoading: boolean
  timezone: string
  dateFormat: 'date' | 'datetime'
  onNavigate: (focus: OxanaFocus) => void
  onUnreadChange?: (count: number) => void
}

export function OxanaNotificationsPanel({
  token,
  authLoading,
  timezone,
  dateFormat,
  onNavigate,
  onUnreadChange,
}: Props) {
  const { showToast } = useToast()
  const [items, setItems] = useState<OxanaNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const reload = useCallback(async () => {
    if (authLoading) return
    if (!token) {
      setLoading(false)
      setError('Сессия ещё не готова. Обновите страницу после входа.')
      return
    }
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 15000)
    try {
      const result = await fetchOxanaNotifications(token, controller.signal)
      if (result.ok) {
        setItems(result.data.notifications)
        setError(null)
        onUnreadChange?.(
          result.data.notifications.filter((item) => !item.readAt).length,
        )
      } else {
        setItems([])
        setError(result.error)
      }
    } finally {
      window.clearTimeout(timer)
      setLoading(false)
    }
  }, [authLoading, onUnreadChange, token])

  useEffect(() => {
    void reload()
  }, [reload])

  const visible = useMemo(
    () =>
      filter === 'unread' ? items.filter((item) => !item.readAt) : items,
    [filter, items],
  )
  const unreadCount = items.filter((item) => !item.readAt).length

  const handleOpen = async (item: OxanaNotification) => {
    if (!item.readAt) {
      const result = await markOxanaNotificationRead(token, item.id)
      if (result.ok) {
        setItems((current) =>
          current.map((row) => (row.id === item.id ? result.data.notification : row)),
        )
        onUnreadChange?.(
          items.filter((row) => row.id !== item.id && !row.readAt).length,
        )
      }
    }
    const ref = notificationTarget(item)
    if (ref?.kind === 'task') onNavigate({ tab: 'tasks', taskId: ref.id })
    if (ref?.kind === 'event') onNavigate({ tab: 'calendar', eventId: ref.id })
    if (ref?.kind === 'project') onNavigate({ tab: 'projects', projectId: ref.id })
  }

  const handleReadOne = async (item: OxanaNotification) => {
    const result = await markOxanaNotificationRead(token, item.id)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setItems((current) =>
      current.map((row) => (row.id === item.id ? result.data.notification : row)),
    )
    onUnreadChange?.(
      items.filter((row) => row.id !== item.id && !row.readAt).length,
    )
  }

  const handleReadAll = async () => {
    const result = await markAllOxanaNotificationsRead(token)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    const now = new Date().toISOString()
    setItems((current) =>
      current.map((row) => ({ ...row, readAt: row.readAt ?? now })),
    )
    onUnreadChange?.(0)
    showToast('Все уведомления отмечены как прочитанные', 'success')
  }

  return (
    <section className="rounded-[1.125rem] border border-border bg-surface p-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Уведомления</h2>
          <p className="mt-0.5 text-xs text-muted">
            {unreadCount
              ? `Непрочитанных: ${unreadCount}`
              : 'Непрочитанных нет'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={filter === 'all' ? OXANA_CHIP_ACTIVE_CLASS : OXANA_CHIP_CLASS}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button
            type="button"
            className={filter === 'unread' ? OXANA_CHIP_ACTIVE_CLASS : OXANA_CHIP_CLASS}
            onClick={() => setFilter('unread')}
          >
            Непрочитанные
          </button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleReadAll()}
            disabled={!unreadCount}
          >
            Прочитать все
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <DataStatus
          loading={loading}
          error={error}
          loadingText="Загрузка уведомлений..."
        />
        {error ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => void reload()}>
            Повторить
          </Button>
        ) : null}
        {!loading && visible.length === 0 && !error ? (
          <p className="rounded-xl border border-border px-4 py-4 text-sm text-muted">
            {filter === 'unread'
              ? 'Непрочитанных уведомлений нет.'
              : 'Уведомлений пока нет. Напоминания появятся здесь после проверки сервером.'}
          </p>
        ) : null}
        <div className="mt-2 space-y-1.5">
          {visible.map((item) => (
            <article
              key={item.id}
              className={`rounded-xl border px-3 py-2.5 ${
                item.readAt ? 'border-border' : 'border-accent/40 bg-soft/60'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => void handleOpen(item)}
                >
                  <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                  {visibleNotificationBody(item.body) ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                      {visibleNotificationBody(item.body)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted">
                    {formatOxanaDate(item.createdAt, timezone, dateFormat)}
                    {item.readAt ? '' : ' · непрочитано'}
                  </p>
                </button>
                {!item.readAt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleReadOne(item)}
                  >
                    Прочитано
                  </Button>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted">прочитано</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
