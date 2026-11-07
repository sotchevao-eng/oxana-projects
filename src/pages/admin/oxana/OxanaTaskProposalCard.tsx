import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/Button'
import {
  createOxanaTask,
  fetchOxanaProjects,
} from '../../../services/oxanaService'
import type {
  OxanaProject,
  OxanaTask,
  OxanaTaskPriority,
  OxanaTaskProposal,
} from '../../../types/oxana'
import { fromDateTimeLocal, toDateTimeLocal } from '../../../utils/oxanaTime'
import {
  OXANA_CARD_CLASS,
  OXANA_FIELD_CLASS,
  OXANA_TEXTAREA_CLASS,
  TASK_PRIORITY_LABELS,
} from './oxanaUi'

interface Props {
  token: string
  timezone: string
  proposal: OxanaTaskProposal
  status: 'open' | 'submitting' | 'created' | 'cancelled'
  error: string | null
  idempotencyKey: string
  onStatus: (status: 'open' | 'submitting' | 'created' | 'cancelled') => void
  onError: (error: string | null) => void
  onCreated: (task: OxanaTask) => void
}

export function OxanaTaskProposalCard({
  token,
  timezone,
  proposal,
  status,
  error,
  idempotencyKey,
  onStatus,
  onError,
  onCreated,
}: Props) {
  const locked = status !== 'open'
  const busyRef = useRef(false)
  const [title, setTitle] = useState(proposal.title)
  const [description, setDescription] = useState(proposal.description ?? '')
  const [dueAt, setDueAt] = useState(toDateTimeLocal(proposal.dueAt, timezone))
  const [priority, setPriority] = useState<OxanaTaskPriority>(proposal.priority)
  const [projectId, setProjectId] = useState(proposal.projectId ?? '')
  const [projects, setProjects] = useState<OxanaProject[]>([])

  useEffect(() => {
    void fetchOxanaProjects(token).then((result) => {
      if (result.ok) {
        setProjects(result.data.projects)
      }
    })
  }, [token])

  const confirm = async () => {
    if (busyRef.current || status !== 'open' || !title.trim()) {
      return
    }
    busyRef.current = true
    onStatus('submitting')
    onError(null)
    const result = await createOxanaTask(token, {
      title: title.trim(),
      description: description.trim() || undefined,
      dueAt: fromDateTimeLocal(dueAt, timezone),
      projectId: projectId || undefined,
      priority,
      idempotencyKey,
    })
    if (!result.ok) {
      busyRef.current = false
      onStatus('open')
      onError(result.error)
      return
    }
    onStatus('created')
    onCreated(result.data.task)
  }

  if (status === 'cancelled') {
    return null
  }

  return (
    <div className={`${OXANA_CARD_CLASS} w-full space-y-2.5`}>
      <div>
        <p
          className="text-xs font-medium tracking-[0.08em] text-muted uppercase"
          role={status === 'created' ? 'status' : undefined}
        >
          {status === 'created'
            ? 'Задача создана'
            : 'Черновик задачи подготовлен'}
        </p>
        {proposal.dueLabel && status !== 'created' ? (
          <p className="mt-0.5 text-xs text-muted">Срок: {proposal.dueLabel}</p>
        ) : null}
      </div>
      <input
        className={OXANA_FIELD_CLASS}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Название"
        disabled={locked}
        maxLength={200}
      />
      <textarea
        className={OXANA_TEXTAREA_CLASS}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Описание, если нужно"
        disabled={locked}
        maxLength={4000}
      />
      <div className="grid gap-2.5 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Проект</span>
          <select
            className={OXANA_FIELD_CLASS}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            disabled={locked}
          >
            <option value="">Без проекта</option>
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
          <span className="text-xs font-medium text-muted">Срок</span>
          <input
            type="datetime-local"
            className={OXANA_FIELD_CLASS}
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            disabled={locked}
          />
        </label>
      </div>
      {error && status !== 'created' ? (
        <p className="text-xs text-red-600" role="status">
          {error}
        </p>
      ) : null}
      {status === 'created' ? null : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            disabled={locked || !title.trim()}
            onClick={() => void confirm()}
          >
            {status === 'submitting' ? 'Создание...' : 'Подтвердить'}
          </Button>
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
