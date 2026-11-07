import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { OxanaMascot } from '../../../components/admin/oxana/OxanaMascot'
import { Button } from '../../../components/Button'
import { DataStatus } from '../../../components/DataStatus'
import { useAuth } from '../../../hooks/useAuth'
import {
  fetchOxanaSettings,
  isOxanaApiConfigured,
  sendOxanaChat,
} from '../../../services/oxanaService'
import type { OxanaOwnerSettings } from '../../../types/oxana'
import { oxanaErrorMessage } from '../../../utils/oxanaErrors'
import { DEFAULT_OXANA_TIMEZONE } from '../../../utils/oxanaTime'
import { OxanaCalendarPanel } from './OxanaCalendarPanel'
import { OxanaNotificationsPanel } from './OxanaNotificationsPanel'
import { OxanaOverviewPanel } from './OxanaOverviewPanel'
import { OxanaProjectsPanel } from './OxanaProjectsPanel'
import { OxanaSettingsPanel } from './OxanaSettingsPanel'
import { OxanaTasksPanel } from './OxanaTasksPanel'
import { OXANA_FIELD_CLASS, type OxanaFocus, type OxanaTabId } from './oxanaUi'

const tabs: Array<{ id: OxanaTabId; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'chat', label: 'Чат' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'calendar', label: 'Календарь' },
  { id: 'projects', label: 'Проекты' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'settings', label: 'Настройки' },
]

const DEFAULT_SETTINGS: OxanaOwnerSettings = {
  displayName: '',
  timezone: DEFAULT_OXANA_TIMEZONE,
  dateFormat: 'datetime',
  notifyTaskDueSoon: true,
  notifyTaskDueDay: true,
  notifyTaskOverdue: true,
  notifyEvent: true,
  taskSoonHours: 24,
  eventSoonMinutes: 30,
}

export function AdminOxanaPage() {
  const { session, loading: authLoading } = useAuth()
  const token = session?.access_token ?? ''
  const [focus, setFocus] = useState<OxanaFocus>({ tab: 'overview' })
  const [settings, setSettings] = useState<OxanaOwnerSettings>(DEFAULT_SETTINGS)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (authLoading || !token) return
    void fetchOxanaSettings(token).then((result) => {
      if (result.ok) {
        setSettings(result.data.settings)
      }
    })
  }, [authLoading, token])

  const onNavigate = useCallback((next: OxanaFocus) => {
    setFocus(next)
  }, [])

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
        {focus.tab === 'overview' ? null : (
          <OxanaMascot className="w-full max-w-[18rem] sm:max-w-[20rem]" />
        )}
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
                aria-selected={focus.tab === item.id}
                onClick={() => setFocus({ tab: item.id })}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  focus.tab === item.id
                    ? 'border-accent/50 bg-soft font-medium text-ink'
                    : 'border-border text-muted hover:bg-soft/80 hover:text-ink'
                }`}
              >
                {item.label}
                {item.id === 'notifications' && unreadCount
                  ? ` · ${unreadCount}`
                  : ''}
              </button>
            ))}
          </div>
          {focus.tab === 'overview' ? (
            <OxanaOverviewPanel
              token={token}
              authLoading={authLoading}
              dateFormat={settings.dateFormat}
              onNavigate={onNavigate}
            />
          ) : null}
          {focus.tab === 'chat' ? <ChatPanel token={token} /> : null}
          {focus.tab === 'tasks' ? (
            <OxanaTasksPanel
              token={token}
              authLoading={authLoading}
              timezone={settings.timezone}
              dateFormat={settings.dateFormat}
              focusTaskId={focus.taskId}
              onNavigate={onNavigate}
            />
          ) : null}
          {focus.tab === 'calendar' ? (
            <OxanaCalendarPanel
              token={token}
              authLoading={authLoading}
              timezone={settings.timezone}
              dateFormat={settings.dateFormat}
              focusEventId={focus.eventId}
              onNavigate={onNavigate}
            />
          ) : null}
          {focus.tab === 'projects' ? (
            <OxanaProjectsPanel
              token={token}
              authLoading={authLoading}
              timezone={settings.timezone}
              dateFormat={settings.dateFormat}
              focusProjectId={focus.projectId}
              onNavigate={onNavigate}
            />
          ) : null}
          {focus.tab === 'notifications' ? (
            <OxanaNotificationsPanel
              token={token}
              authLoading={authLoading}
              timezone={settings.timezone}
              dateFormat={settings.dateFormat}
              onNavigate={onNavigate}
              onUnreadChange={setUnreadCount}
            />
          ) : null}
          {focus.tab === 'settings' ? (
            <OxanaSettingsPanel
              token={token}
              authLoading={authLoading}
              onSettingsChange={setSettings}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function ChatPanel({ token }: { token: string }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [turns, setTurns] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>(
    [],
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const text = message.trim()
    if (!text || sending) {
      return
    }
    setSending(true)
    setNotice(null)
    setMessage('')
    setTurns((current) => [...current, { role: 'user', text }])
    const result = await sendOxanaChat(token, text)
    setSending(false)
    if (result.ok) {
      setTurns((current) => [
        ...current,
        { role: 'assistant', text: result.data.reply },
      ])
      return
    }
    setNotice(result.error)
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">Чат</h2>
      <p className="mt-1 text-sm text-muted">
        Ответ приходит из GigaChat. При ошибке текст модели не подставляется.
      </p>
      {turns.length ? (
        <ul className="mt-4 space-y-2">
          {turns.map((turn, index) => (
            <li
              key={`${turn.role}-${index}`}
              className="rounded-2xl border border-border bg-soft px-4 py-3 text-sm text-ink"
            >
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                {turn.role === 'user' ? 'Вы' : 'ОКСИ'}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{turn.text}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
        <textarea
          className={`${OXANA_FIELD_CLASS} min-h-28 resize-y`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Напишите ОКСИ"
          maxLength={4000}
        />
        {notice ? (
          <p
            className="rounded-2xl border border-border bg-soft px-4 py-3 text-sm text-muted"
            role="status"
          >
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
