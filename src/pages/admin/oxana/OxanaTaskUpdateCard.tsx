import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/Button'
import {
  proposeOxanaTaskUpdate,
  updateOxanaTask,
} from '../../../services/oxanaService'
import type {
  OxanaTask,
  OxanaTaskPriority,
  OxanaTaskStatus,
  OxanaUpdateField,
  OxanaUpdateTaskIntend,
  OxanaUpdateTaskProposal,
} from '../../../types/oxana'
import { oxanaErrorMessage } from '../../../utils/oxanaErrors'
import { fromDateTimeLocal, toDateTimeLocal } from '../../../utils/oxanaTime'
import {
  isProposalCardLocked,
  proposalCardHeading,
  updateDiffLabel,
  type OxanaProposalCardStatus,
} from './oxanaProposalCard'
import {
  OXANA_CARD_CLASS,
  OXANA_FIELD_CLASS,
  OXANA_TEXTAREA_CLASS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from './oxanaUi'

interface Props {
  token: string
  timezone: string
  proposal: OxanaUpdateTaskProposal
  status: OxanaProposalCardStatus
  error: string | null
  idempotencyKey: string
  onProposal: (proposal: OxanaUpdateTaskProposal) => void
  onStatus: (status: OxanaProposalCardStatus) => void
  onError: (error: string | null) => void
  onUpdated: (task: OxanaTask) => void
}

function displayDue(
  iso: string | null,
  label: string | null,
  timezone: string,
): string {
  if (label) {
    return label
  }
  if (!iso) {
    return 'нет'
  }
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso))
}

export function OxanaTaskUpdateCard({
  token,
  timezone,
  proposal,
  status,
  error,
  idempotencyKey,
  onProposal,
  onStatus,
  onError,
  onUpdated,
}: Props) {
  const locked = isProposalCardLocked(status)
  const busyRef = useRef(false)
  const [title, setTitle] = useState(proposal.next.title)
  const [description, setDescription] = useState(proposal.next.description ?? '')
  const [dueAt, setDueAt] = useState(
    toDateTimeLocal(proposal.next.dueAt, timezone),
  )
  const [priority, setPriority] = useState<OxanaTaskPriority>(
    proposal.next.priority,
  )
  const [taskStatus, setTaskStatus] = useState<OxanaTaskStatus>(
    proposal.next.status,
  )

  useEffect(() => {
    setTitle(proposal.next.title)
    setDescription(proposal.next.description ?? '')
    setDueAt(toDateTimeLocal(proposal.next.dueAt, timezone))
    setPriority(proposal.next.priority)
    setTaskStatus(proposal.next.status)
    busyRef.current = false
  }, [
    idempotencyKey,
    proposal.taskId,
    proposal.updatedAt,
    proposal.next.title,
    proposal.next.description,
    proposal.next.dueAt,
    proposal.next.priority,
    proposal.next.status,
    timezone,
  ])

  const showDescription = proposal.fields.includes('description')
  const showTitle = proposal.fields.includes('title')
  const initialDueLocal = toDateTimeLocal(proposal.next.dueAt, timezone)
  const dueEdited = dueAt !== initialDueLocal
  const confirmBlocked = Boolean(proposal.dueNeedsClarification) && !dueEdited

  const confirm = async () => {
    if (busyRef.current || status !== 'open') {
      return
    }
    if (proposal.dueNeedsClarification && !dueEdited) {
      onError('Укажите срок: сегодня или следующая неделя.')
      return
    }
    const nextDue = fromDateTimeLocal(dueAt, timezone) ?? null
    const patch: {
      title?: string
      description?: string | null
      dueAt?: string | null
      priority?: OxanaTaskPriority
      status?: OxanaTaskStatus
      expectedUpdatedAt: string
      idempotencyKey: string
    } = {
      expectedUpdatedAt: proposal.updatedAt,
      idempotencyKey,
    }
    const include = (field: OxanaUpdateField, changed: boolean) =>
      proposal.fields.includes(field) || changed

    if (include('title', title.trim() !== proposal.next.title)) {
      if (!title.trim()) {
        onError(oxanaErrorMessage('title_required'))
        return
      }
      patch.title = title.trim()
    }
    if (
      include(
        'description',
        (description.trim() || null) !== (proposal.next.description ?? null),
      )
    ) {
      patch.description = description.trim() || null
    }
    if (include('dueAt', dueEdited)) {
      patch.dueAt = nextDue
    }
    if (include('priority', priority !== proposal.next.priority)) {
      patch.priority = priority
    }
    if (
      include('status', taskStatus !== proposal.next.status) &&
      (taskStatus === 'open' || taskStatus === 'in_progress')
    ) {
      patch.status = taskStatus
    }

    busyRef.current = true
    onStatus('submitting')
    onError(null)
    const result = await updateOxanaTask(token, proposal.taskId, patch)
    if (!result.ok) {
      busyRef.current = false
      onStatus('open')
      onError(result.error)
      return
    }
    onStatus('updated')
    onUpdated(result.data.task)
  }

  const refresh = async () => {
    if (busyRef.current) {
      return
    }
    busyRef.current = true
    onError(null)
    const intend: OxanaUpdateTaskIntend = {}
    if (proposal.fields.includes('title')) intend.title = title.trim()
    if (proposal.fields.includes('description')) {
      intend.description = description.trim() || null
    }
    if (proposal.fields.includes('dueAt')) {
      intend.dueAt = fromDateTimeLocal(dueAt, timezone) ?? null
    }
    if (proposal.fields.includes('priority')) intend.priority = priority
    if (
      proposal.fields.includes('status') &&
      (taskStatus === 'open' || taskStatus === 'in_progress')
    ) {
      intend.status = taskStatus
    }
    const result = await proposeOxanaTaskUpdate(
      token,
      proposal.taskId,
      intend,
    )
    busyRef.current = false
    if (!result.ok) {
      onError(result.error)
      return
    }
    onProposal(result.data.proposal)
    onStatus('open')
  }

  if (status === 'cancelled') {
    return null
  }

  return (
    <div className={`${OXANA_CARD_CLASS} w-full space-y-2.5`}>
      <div>
        <p
          className="text-xs font-medium tracking-[0.08em] text-muted"
          role="status"
        >
          {proposalCardHeading(status, 'update_task')}
        </p>
        <p className="mt-0.5 text-sm font-medium text-ink">
          {proposal.current.title}
        </p>
        {proposal.dueNeedsClarification && status !== 'updated' ? (
          <p className="mt-1 text-xs text-muted">
            Сегодня {proposal.dueAmbiguousWeekday ?? 'этот день недели'}. Укажите
            срок: сегодня или следующая неделя.
          </p>
        ) : null}
      </div>
      {showTitle ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">
            {updateDiffLabel('Название', proposal.current.title)}
          </span>
          <input
            className={OXANA_FIELD_CLASS}
            name={`oxana-update-title-${idempotencyKey}`}
            autoComplete="off"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={locked}
            maxLength={200}
          />
        </label>
      ) : null}
      {showDescription ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">
            {updateDiffLabel(
              'Описание',
              proposal.current.description?.trim() || 'нет',
            )}
          </span>
          <textarea
            className={OXANA_TEXTAREA_CLASS}
            name={`oxana-update-description-${idempotencyKey}`}
            autoComplete="off"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={locked}
            maxLength={4000}
          />
        </label>
      ) : null}
      <div className="grid gap-2.5 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">
            {updateDiffLabel(
              'Срок',
              displayDue(
                proposal.current.dueAt,
                proposal.current.dueLabel,
                timezone,
              ),
            )}
          </span>
          <input
            type="datetime-local"
            className={OXANA_FIELD_CLASS}
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            disabled={locked}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">
            {updateDiffLabel(
              'Приоритет',
              TASK_PRIORITY_LABELS[proposal.current.priority],
            )}
          </span>
          <select
            className={OXANA_FIELD_CLASS}
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as OxanaTaskPriority)
            }
            disabled={locked}
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
          <span className="text-xs font-medium text-muted">
            {updateDiffLabel(
              'Статус',
              TASK_STATUS_LABELS[proposal.current.status],
            )}
          </span>
          <select
            className={OXANA_FIELD_CLASS}
            value={taskStatus}
            onChange={(event) =>
              setTaskStatus(event.target.value as OxanaTaskStatus)
            }
            disabled={locked}
          >
            {(['open', 'in_progress'] as OxanaTaskStatus[]).map((item) => (
              <option key={item} value={item}>
                {TASK_STATUS_LABELS[item]}
              </option>
            ))}
            {taskStatus !== 'open' && taskStatus !== 'in_progress' ? (
              <option value={taskStatus}>
                {TASK_STATUS_LABELS[taskStatus]}
              </option>
            ) : null}
          </select>
        </label>
      </div>
      {error && status !== 'updated' ? (
        <p className="text-xs text-red-600" role="status">
          {error}
        </p>
      ) : null}
      {status === 'updated' ? null : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            disabled={locked || confirmBlocked}
            onClick={() => void confirm()}
          >
            {status === 'submitting' ? 'Сохранение...' : 'Подтвердить изменения'}
          </Button>
          {error === oxanaErrorMessage('task_changed') ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={locked}
              onClick={() => void refresh()}
            >
              Обновить карточку
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={locked}
            onClick={() => onStatus('cancelled')}
          >
            Отмена
          </Button>
        </div>
      )}
    </div>
  )
}
