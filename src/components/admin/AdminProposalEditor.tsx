import { useEffect, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { Button } from '../Button'
import { useToast } from '../ToastProvider'
import { AdminProposalAiModal } from './AdminProposalAiModal'
import type { ClientProject } from '../../types/clientProject'
import {
  PROPOSAL_FEEDBACK_ACTION_LABELS,
  PROPOSAL_SECTION_TYPE_LABELS,
  PROPOSAL_SECTION_TYPES,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUSES,
  defaultProposalSections,
  emptyProposalForm,
  type Proposal,
  type ProposalFeedbackItem,
  type ProposalFormValues,
  type ProposalSection,
  type ProposalSectionType,
} from '../../types/proposal'
import { formatAdminDate, formatAdminDateTime } from '../../services/adminService'
import {
  createProposal,
  fetchProposalByProjectId,
  fetchProposalFeedback,
  proposalToForm,
  setProposalPublished,
  updateProposal,
} from '../../services/proposalService'
import { getProposalPublicUrl } from '../../utils/publicTokens'

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-60'

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

interface AdminProposalEditorProps {
  project: ClientProject
  onProjectStatusMaybeChanged?: () => void
}

export function AdminProposalEditor({
  project,
  onProjectStatusMaybeChanged,
}: AdminProposalEditorProps) {
  const { showToast } = useToast()
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [form, setForm] = useState<ProposalFormValues>(emptyProposalForm())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [feedback, setFeedback] = useState<ProposalFeedbackItem[]>([])

  const proposalUrl = getProposalPublicUrl(project.proposalToken)

  const load = async () => {
    setLoading(true)
    const result = await fetchProposalByProjectId(project.id)
    setProposal(result.data)
    setError(result.error)
    if (result.data) {
      setForm(proposalToForm(result.data))
      const feedbackResult = await fetchProposalFeedback(result.data.id)
      setFeedback(feedbackResult.data)
    } else {
      setForm(emptyProposalForm())
      setFeedback([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [project.id])

  const updateSection = (
    index: number,
    patch: Partial<ProposalSection>,
  ) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section, i) =>
        i === index ? { ...section, ...patch } : section,
      ),
    }))
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    const next = index + direction
    if (next < 0 || next >= form.sections.length) {
      return
    }
    setForm((prev) => {
      const sections = [...prev.sections]
      const [item] = sections.splice(index, 1)
      sections.splice(next, 0, item)
      return {
        ...prev,
        sections: sections.map((section, i) => ({
          ...section,
          sortOrder: i,
        })),
      }
    })
  }

  const removeSection = (index: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections
        .filter((_, i) => i !== index)
        .map((section, i) => ({ ...section, sortOrder: i })),
    }))
  }

  const addSection = () => {
    setForm((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          sectionType: 'scope',
          title: 'Новая секция',
          content: '',
          sortOrder: prev.sections.length,
          visible: true,
        },
      ],
    }))
  }

  const resetSections = () => {
    setForm((prev) => ({
      ...prev,
      sections: defaultProposalSections(),
    }))
  }

  const handleCreate = async () => {
    setSaving(true)
    const result = await createProposal(project.id, form)
    setSaving(false)
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Не удалось создать КП', 'error')
      return
    }
    setProposal(result.data)
    setForm(proposalToForm(result.data))
    showToast('КП создано', 'success')
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    if (!proposal) {
      await handleCreate()
      return
    }
    setSaving(true)
    const result = await updateProposal(proposal.id, project.id, form)
    setSaving(false)
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Не удалось сохранить КП', 'error')
      return
    }
    setProposal(result.data)
    setForm(proposalToForm(result.data))
    showToast('КП сохранено', 'success')
  }

  const handlePublishToggle = async () => {
    if (!proposal) {
      showToast('Сначала создайте и сохраните КП', 'error')
      return
    }
    if (!form.price.trim() && !proposal.price.trim()) {
      showToast('Укажите цену перед публикацией', 'error')
      return
    }
    setPublishing(true)
    // Persist latest edits before publish
    const saved = await updateProposal(proposal.id, project.id, form)
    if (!saved.ok || !saved.data) {
      setPublishing(false)
      showToast(saved.error ?? 'Не удалось сохранить перед публикацией', 'error')
      return
    }
    const nextPublished = !saved.data.published
    const result = await setProposalPublished(
      proposal.id,
      project.id,
      nextPublished,
    )
    setPublishing(false)
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Не удалось изменить публикацию', 'error')
      return
    }
    setProposal(result.data)
    setForm(proposalToForm(result.data))
    onProjectStatusMaybeChanged?.()
    showToast(
      nextPublished ? 'КП опубликовано' : 'КП снято с публикации',
      'success',
    )
  }

  const handleCopyLink = async () => {
    const ok = await copyText(proposalUrl)
    showToast(
      ok ? 'Ссылка на КП скопирована' : 'Не удалось скопировать ссылку',
      ok ? 'success' : 'error',
    )
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border px-4 py-10 text-center text-sm text-muted">
        Загрузка КП...
      </div>
    )
  }

  if (error && !proposal) {
    return (
      <div className="space-y-3 rounded-xl border border-border px-4 py-6">
        <p className="text-sm text-red-400">{error}</p>
        <Button type="button" variant="ghost" onClick={() => void load()}>
          Повторить
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-panel/40 px-4 py-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-ink">
            Статус:{' '}
            <span className="font-medium">
              {PROPOSAL_STATUS_LABELS[
                (proposal?.status as keyof typeof PROPOSAL_STATUS_LABELS) ??
                  'draft'
              ] ?? proposal?.status ?? 'Черновик'}
            </span>
            {proposal?.published ? (
              <span className="ml-2 text-xs text-accent">· опубликовано</span>
            ) : null}
          </p>
          {proposal?.acceptedAt ? (
            <p className="text-xs text-muted">
              Принято: {formatAdminDate(proposal.acceptedAt)}
            </p>
          ) : null}
          {proposal?.changesRequestedAt ? (
            <p className="text-xs text-muted">
              Запрос изменений: {formatAdminDate(proposal.changesRequestedAt)}
            </p>
          ) : null}
          <p className="break-all text-xs text-muted">{proposalUrl}</p>
          <p className="text-xs text-muted">
            После публикации страница доступна по этой ссылке.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => void handleCopyLink()}>
            Скопировать ссылку
          </Button>
          <Button href={proposalUrl} variant="ghost" external>
            Открыть КП
          </Button>
        </div>
      </div>

      {proposal ? (
        <div className="rounded-xl border border-border px-4 py-4">
          <h3 className="text-sm font-medium text-ink">Ответы клиента</h3>
          {feedback.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Пока нет принятия или запросов изменений.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {feedback.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-border/70 bg-soft/40 px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">
                      {PROPOSAL_FEEDBACK_ACTION_LABELS[item.action] ??
                        item.action}
                    </p>
                    <p className="text-xs text-muted">
                      {formatAdminDateTime(item.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {item.name || 'Без имени'}
                  </p>
                  {item.comment ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                      {item.comment}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted">Без комментария</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {!proposal ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm text-ink">КП ещё не создано</p>
          <p className="mt-1 text-xs text-muted">
            Создайте вручную или сгенерируйте черновик с ИИ.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" disabled={saving} onClick={() => void handleCreate()}>
              {saving ? 'Создание...' : 'Создать вручную'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAiOpen(true)}>
              Сгенерировать КП с ИИ
            </Button>
          </div>
        </div>
      ) : null}

      {proposal || form.sections.length > 0 ? (
        <form onSubmit={(event) => void handleSave(event)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs text-muted">Заголовок</label>
              <input
                className={fieldClass}
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs text-muted">Подзаголовок</label>
              <input
                className={fieldClass}
                value={form.subtitle}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, subtitle: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs text-muted">Вступление</label>
              <textarea
                className={`${fieldClass} min-h-24 resize-y`}
                value={form.intro}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, intro: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Цена (задаёт администратор)</label>
              <input
                className={fieldClass}
                value={form.price}
                placeholder="например, от 120 000 ₽"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, price: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Срок (задаёт администратор)</label>
              <input
                className={fieldClass}
                value={form.deadline}
                placeholder="например, 4–6 недель"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, deadline: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Статус</label>
              <select
                className={fieldClass}
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                {PROPOSAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PROPOSAL_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-ink">Секции КП</h3>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={addSection}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Добавить
                </Button>
                <Button type="button" variant="ghost" onClick={resetSections}>
                  Шаблон по умолчанию
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {form.sections.map((section, index) => (
                <div
                  key={`${section.sectionType}-${index}`}
                  className="rounded-xl border border-border bg-panel/30 px-4 py-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">Секция {index + 1}</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-bg hover:text-ink"
                        title={section.visible ? 'Скрыть' : 'Показать'}
                        onClick={() =>
                          updateSection(index, { visible: !section.visible })
                        }
                      >
                        {section.visible ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-bg hover:text-ink disabled:opacity-40"
                        disabled={index === 0}
                        onClick={() => moveSection(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-bg hover:text-ink disabled:opacity-40"
                        disabled={index === form.sections.length - 1}
                        onClick={() => moveSection(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-bg hover:text-red-400"
                        onClick={() => removeSection(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted">Тип</label>
                      <select
                        className={fieldClass}
                        value={section.sectionType}
                        onChange={(event) =>
                          updateSection(index, {
                            sectionType: event.target.value as ProposalSectionType,
                          })
                        }
                      >
                        {PROPOSAL_SECTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {PROPOSAL_SECTION_TYPE_LABELS[type]}
                          </option>
                        ))}
                        {!PROPOSAL_SECTION_TYPES.includes(
                          section.sectionType as ProposalSectionType,
                        ) ? (
                          <option value={section.sectionType}>
                            {section.sectionType}
                          </option>
                        ) : null}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted">Заголовок секции</label>
                      <input
                        className={fieldClass}
                        value={section.title}
                        onChange={(event) =>
                          updateSection(index, { title: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs text-muted">Содержание</label>
                      <textarea
                        className={`${fieldClass} min-h-28 resize-y`}
                        value={section.content}
                        onChange={(event) =>
                          updateSection(index, { content: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving
                ? 'Сохранение...'
                : proposal
                  ? 'Сохранить КП'
                  : 'Создать КП'}
            </Button>
            {proposal ? (
              <Button
                type="button"
                variant="ghost"
                disabled={publishing || saving}
                onClick={() => void handlePublishToggle()}
              >
                {publishing
                  ? 'Публикация...'
                  : proposal.published
                    ? 'Снять с публикации'
                    : 'Опубликовать'}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => setAiOpen(true)}>
              Сгенерировать КП с ИИ
            </Button>
          </div>
        </form>
      ) : null}

      <AdminProposalAiModal
        open={aiOpen}
        project={project}
        initialPrice={form.price || project.budget || ''}
        initialDeadline={form.deadline || project.deadline || ''}
        onClose={() => setAiOpen(false)}
        onApplied={() => {
          void load()
          onProjectStatusMaybeChanged?.()
        }}
      />
    </div>
  )
}
