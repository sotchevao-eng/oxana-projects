import { useRef, useState } from 'react'
import { Button } from '../../../components/Button'
import { proposeOxanaTaskUpdate } from '../../../services/oxanaService'
import type {
  OxanaChooseTaskProposal,
  OxanaUpdateTaskProposal,
} from '../../../types/oxana'
import {
  OXANA_CARD_CLASS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from './oxanaUi'

interface Props {
  token: string
  proposal: OxanaChooseTaskProposal
  status: 'open' | 'submitting' | 'cancelled'
  error: string | null
  onError: (error: string | null) => void
  onChosen: (proposal: OxanaUpdateTaskProposal) => void
  onCancel: () => void
}

export function OxanaTaskChooseCard({
  token,
  proposal,
  status,
  error,
  onError,
  onChosen,
  onCancel,
}: Props) {
  const busyRef = useRef(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const choose = async (taskId: string) => {
    if (busyRef.current || status !== 'open') {
      return
    }
    busyRef.current = true
    setPendingId(taskId)
    onError(null)
    const result = await proposeOxanaTaskUpdate(token, taskId, {
      ...proposal.intend,
      dueNeedsClarification: proposal.dueNeedsClarification,
      dueAmbiguousWeekday: proposal.dueAmbiguousWeekday,
    })
    busyRef.current = false
    setPendingId(null)
    if (!result.ok) {
      onError(result.error)
      return
    }
    onChosen(result.data.proposal)
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
          Выберите задачу
        </p>
        <p className="mt-0.5 text-sm text-ink">
          Несколько задач называются «{proposal.query}».
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {proposal.matches.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant="secondary"
            disabled={status !== 'open' || Boolean(pendingId)}
            onClick={() => void choose(item.id)}
          >
            {pendingId === item.id
              ? 'Открываю...'
              : [
                  item.title,
                  item.dueLabel ?? 'без срока',
                  TASK_PRIORITY_LABELS[item.priority],
                  TASK_STATUS_LABELS[item.status],
                ].join(' · ')}
          </Button>
        ))}
      </div>
      {error ? (
        <p className="text-xs text-red-600" role="status">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={status !== 'open' || Boolean(pendingId)}
        onClick={onCancel}
      >
        Отмена
      </Button>
    </div>
  )
}
