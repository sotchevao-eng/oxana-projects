import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
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
import {
  clearOxanaChatSession,
  loadOxanaChatSession,
  oxanaChatHistoryForRequest,
  saveOxanaChatSession,
  type OxanaChatTurn,
} from '../../../utils/oxanaChatSession'
import { oxanaErrorMessage } from '../../../utils/oxanaErrors'
import {
  DEFAULT_OXANA_TIMEZONE,
  formatOxanaChatTimestamp,
  msUntilNextOxanaMidnight,
} from '../../../utils/oxanaTime'
import { OxanaCalendarPanel } from './OxanaCalendarPanel'
import { OxanaNotificationsPanel } from './OxanaNotificationsPanel'
import { OxanaOverviewPanel } from './OxanaOverviewPanel'
import { OxanaProjectsPanel } from './OxanaProjectsPanel'
import { OxanaSettingsPanel } from './OxanaSettingsPanel'
import { OxanaTaskChooseCard } from './OxanaTaskChooseCard'
import { OxanaTaskProposalCard } from './OxanaTaskProposalCard'
import { OxanaTaskUpdateCard } from './OxanaTaskUpdateCard'
import { OxanaTasksPanel } from './OxanaTasksPanel'
import { type OxanaFocus, type OxanaTabId } from './oxanaUi'

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
  const userId = session?.user?.id ?? ''
  const previousUserId = useRef(userId)
  const [focus, setFocus] = useState<OxanaFocus>({ tab: 'overview' })
  const [settings, setSettings] = useState<OxanaOwnerSettings>(DEFAULT_SETTINGS)
  const [unreadCount, setUnreadCount] = useState(0)
  const [cabinetEpoch, setCabinetEpoch] = useState(0)

  useEffect(() => {
    if (authLoading || !token) return
    void fetchOxanaSettings(token).then((result) => {
      if (result.ok) {
        setSettings(result.data.settings)
      }
    })
  }, [authLoading, token])

  useEffect(() => {
    const previous = previousUserId.current
    if (previous && previous !== userId) {
      clearOxanaChatSession(previous)
    }
    previousUserId.current = userId
  }, [userId])

  const onNavigate = useCallback((next: OxanaFocus) => {
    setFocus(next)
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
            OXANA AI
          </p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-ink md:text-xl">
            ОКСИ
          </h1>
          <p className="mt-0.5 max-w-xl text-xs leading-snug text-muted sm:text-sm">
            Личный контур на российской инфраструктуре. Telegram и MAX подключим
            позже.
          </p>
        </div>
        <OxanaMascot
          compact
          className="w-[5.5rem] shrink-0 sm:w-32"
        />
      </div>

      {!isOxanaApiConfigured() ? (
        <DataStatus error={oxanaErrorMessage('api_not_configured')} />
      ) : (
        <>
          <div
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
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
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors sm:text-sm ${
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
              key={cabinetEpoch}
              token={token}
              authLoading={authLoading}
              dateFormat={settings.dateFormat}
              onNavigate={onNavigate}
            />
          ) : null}
          <div
            className={focus.tab === 'chat' ? undefined : 'hidden'}
            hidden={focus.tab !== 'chat'}
          >
            <ChatPanel
              token={token}
              userId={userId}
              timezone={settings.timezone}
              active={focus.tab === 'chat'}
              onTaskCreated={() => setCabinetEpoch((value) => value + 1)}
            />
          </div>
          {focus.tab === 'tasks' ? (
            <OxanaTasksPanel
              key={cabinetEpoch}
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

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((item) => item.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function ChatPanel({
  token,
  userId,
  timezone,
  active,
  onTaskCreated,
}: {
  token: string
  userId: string
  timezone: string
  active: boolean
  onTaskCreated: () => void
}) {
  const [message, setMessage] = useState(
    () => loadOxanaChatSession(userId).message,
  )
  const [sending, setSending] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [turns, setTurns] = useState<OxanaChatTurn[]>(
    () => loadOxanaChatSession(userId).turns,
  )
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const skipNextSave = useRef(true)

  useEffect(() => {
    skipNextSave.current = true
    const loaded = loadOxanaChatSession(userId)
    setTurns(loaded.turns)
    setMessage(loaded.message)
    setSending(false)
  }, [userId])

  useEffect(() => {
    const delay = Math.min(
      msUntilNextOxanaMidnight(new Date(nowMs), DEFAULT_OXANA_TIMEZONE),
      2_147_000_000,
    )
    const timer = window.setTimeout(() => setNowMs(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [nowMs])

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    if (!userId) {
      return
    }
    saveOxanaChatSession(userId, { turns, message })
  }, [userId, turns, message])

  useEffect(() => {
    if (!active) {
      return
    }
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, sending, active])

  const updateAssistant = (
    index: number,
    patch: Partial<Extract<OxanaChatTurn, { role: 'assistant' }>>,
  ) => {
    setTurns((current) =>
      current.map((turn, itemIndex) =>
        itemIndex === index && turn.role === 'assistant'
          ? { ...turn, ...patch }
          : turn,
      ),
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const text = message.trim()
    if (!text || sending) {
      return
    }
    setSending(true)
    setMessage('')
    const sentAt = new Date().toISOString()
    setTurns((current) => [
      ...current.map((turn) =>
        turn.role === 'assistant' && turn.proposalStatus === 'open'
          ? { ...turn, proposalStatus: 'cancelled' as const }
          : turn,
      ),
      { role: 'user', text, sentAt },
    ])
    const result = await sendOxanaChat(
      token,
      text,
      oxanaChatHistoryForRequest(turns),
    )
    const receivedAt = new Date().toISOString()
    setSending(false)
    if (result.ok) {
      const proposal = result.data.proposal
      setTurns((current) => [
        ...current,
        {
          role: 'assistant',
          text: result.data.reply,
          sentAt: receivedAt,
          proposal,
          proposalStatus: proposal ? 'open' : undefined,
          idempotencyKey:
            proposal && proposal.type !== 'choose_task'
              ? newIdempotencyKey()
              : undefined,
        },
      ])
      return
    }
    setTurns((current) => [
      ...current,
      { role: 'assistant', text: result.error, sentAt: receivedAt },
    ])
  }

  return (
    <section className="flex h-[min(38rem,calc(100dvh-11rem))] min-h-[26rem] flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-ink">Чат</h2>
        <p className="mt-0.5 text-xs text-muted">
          Ответ приходит из GigaChat. При ошибке текст модели не подставляется.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3 sm:px-4">
        {turns.length === 0 && !sending ? (
          <p className="m-auto max-w-xs text-center text-sm text-muted">
            Напишите ОКСИ — диалог появится здесь.
          </p>
        ) : (
          turns.map((turn, index) => {
            const mine = turn.role === 'user'
            const stamp = formatOxanaChatTimestamp(
              turn.sentAt,
              new Date(nowMs),
              DEFAULT_OXANA_TIMEZONE,
            )
            return (
              <div key={`${turn.role}-${index}`} className="flex flex-col gap-2">
                <div
                  className={`flex w-[72%] max-w-[72%] flex-col ${
                    mine ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  <p
                    className={`mb-0.5 flex items-baseline gap-1.5 px-1 ${
                      mine ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span className="text-[10px] font-medium tracking-[0.06em] text-muted uppercase">
                      {mine ? 'Вы' : 'ОКСИ'}
                    </span>
                    {stamp ? (
                      <span className="text-[10px] font-normal normal-case tracking-normal text-muted">
                        {stamp}
                      </span>
                    ) : null}
                  </p>
                  <div
                    className={`whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-ink ${
                      mine
                        ? 'rounded-2xl rounded-tr-md bg-accent/20'
                        : 'rounded-2xl rounded-tl-md bg-soft'
                    }`}
                  >
                    {turn.text}
                  </div>
                </div>
                {turn.role === 'assistant' &&
                turn.proposal?.type === 'create_task' &&
                turn.proposalStatus &&
                turn.proposalStatus !== 'cancelled' &&
                turn.proposalStatus !== 'updated' &&
                turn.idempotencyKey ? (
                  <OxanaTaskProposalCard
                    key={turn.idempotencyKey}
                    token={token}
                    timezone={timezone}
                    active={active}
                    proposal={turn.proposal}
                    status={turn.proposalStatus}
                    error={turn.proposalError ?? null}
                    idempotencyKey={turn.idempotencyKey}
                    onStatus={(proposalStatus) =>
                      updateAssistant(index, { proposalStatus })
                    }
                    onError={(proposalError) =>
                      updateAssistant(index, { proposalError })
                    }
                    onCreated={() => {
                      onTaskCreated()
                    }}
                  />
                ) : null}
                {turn.role === 'assistant' &&
                turn.proposal?.type === 'update_task' &&
                turn.proposalStatus &&
                turn.proposalStatus !== 'cancelled' &&
                turn.proposalStatus !== 'created' &&
                turn.idempotencyKey ? (
                  <OxanaTaskUpdateCard
                    key={turn.idempotencyKey}
                    token={token}
                    timezone={timezone}
                    proposal={turn.proposal}
                    status={turn.proposalStatus}
                    error={turn.proposalError ?? null}
                    idempotencyKey={turn.idempotencyKey}
                    onProposal={(proposal) =>
                      updateAssistant(index, { proposal, proposalError: null })
                    }
                    onStatus={(proposalStatus) =>
                      updateAssistant(index, { proposalStatus })
                    }
                    onError={(proposalError) =>
                      updateAssistant(index, { proposalError })
                    }
                    onUpdated={() => {
                      onTaskCreated()
                    }}
                  />
                ) : null}
                {turn.role === 'assistant' &&
                turn.proposal?.type === 'choose_task' &&
                turn.proposalStatus &&
                turn.proposalStatus !== 'cancelled' ? (
                  <OxanaTaskChooseCard
                    token={token}
                    proposal={turn.proposal}
                    status={
                      turn.proposalStatus === 'submitting' ? 'submitting' : 'open'
                    }
                    error={turn.proposalError ?? null}
                    onError={(proposalError) =>
                      updateAssistant(index, { proposalError })
                    }
                    onChosen={(proposal) =>
                      updateAssistant(index, {
                        proposal,
                        proposalStatus: 'open',
                        proposalError: null,
                        idempotencyKey: newIdempotencyKey(),
                      })
                    }
                    onCancel={() =>
                      updateAssistant(index, { proposalStatus: 'cancelled' })
                    }
                  />
                ) : null}
              </div>
            )
          })
        )}
        {sending ? (
          <div className="mr-auto flex w-[72%] max-w-[72%] flex-col items-start">
            <p className="mb-0.5 px-1 text-[10px] font-medium tracking-[0.06em] text-muted uppercase">
              ОКСИ
            </p>
            <div className="rounded-2xl rounded-tl-md bg-soft px-3 py-2 text-sm text-muted">
              печатает...
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border bg-bg/40 px-3 py-2.5 sm:px-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <textarea
          className="min-h-11 max-h-32 flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder="Напишите ОКСИ"
          maxLength={4000}
          rows={1}
        />
        <Button type="submit" size="sm" disabled={sending || !message.trim()}>
          {sending ? 'Отправка...' : 'Отправить'}
        </Button>
      </form>
    </section>
  )
}
