import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../Button'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useToast } from '../ToastProvider'
import type { ClientProject } from '../../types/clientProject'
import type { BriefAnswersMap, BriefField } from '../../types/brief'
import {
  PROPOSAL_SECTION_TYPE_LABELS,
  PROPOSAL_SECTION_TYPES,
  type ProposalSectionType,
} from '../../types/proposal'
import {
  PROPOSAL_AI_STYLE_LABELS,
  PROPOSAL_AI_STYLES,
  type ProposalAiDraft,
  type ProposalAiSectionDraft,
  type ProposalAiStyle,
} from '../../types/proposalAi'
import {
  answersToMap,
  fetchBriefFields,
  fetchLatestBriefSubmission,
} from '../../services/briefService'
import { generateProposalWithAi } from '../../services/proposalAiService'
import {
  applyProposalAiDraft,
  logProposalAiGeneration,
} from '../../services/proposalService'
import { formatProposalAiErrorForUi } from '../../utils/proposalAiValidate'

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-60'

function displayAnswer(value: BriefAnswersMap[string]): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  const text = String(value).trim()
  return text || '—'
}

interface AdminProposalAiModalProps {
  open: boolean
  project: ClientProject
  initialPrice?: string
  initialDeadline?: string
  onClose: () => void
  onApplied: () => void
}

export function AdminProposalAiModal({
  open,
  project,
  initialPrice = '',
  initialDeadline = '',
  onClose,
  onApplied,
}: AdminProposalAiModalProps) {
  const { showToast } = useToast()
  useScrollLock(open)

  const [step, setStep] = useState<'form' | 'preview'>('form')
  const [price, setPrice] = useState(initialPrice)
  const [deadline, setDeadline] = useState(initialDeadline)
  const [comment, setComment] = useState('')
  const [proposalStyle, setProposalStyle] =
    useState<ProposalAiStyle>('standard')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [intro, setIntro] = useState('')
  const [sections, setSections] = useState<ProposalAiSectionDraft[]>([])
  const [model, setModel] = useState<string | undefined>()
  const [briefFields, setBriefFields] = useState<BriefField[]>([])
  const [briefAnswers, setBriefAnswers] = useState<BriefAnswersMap>({})
  const [briefLoading, setBriefLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setStep('form')
    setPrice(initialPrice)
    setDeadline(initialDeadline)
    setComment('')
    setProposalStyle('standard')
    setTitle('')
    setSubtitle('')
    setIntro('')
    setSections([])
    setModel(undefined)
    setError(null)

    let active = true
    const loadBrief = async () => {
      setBriefLoading(true)
      const [fieldsResult, submissionResult] = await Promise.all([
        fetchBriefFields(project.id),
        fetchLatestBriefSubmission(project.id),
      ])
      if (!active) return
      setBriefFields(fieldsResult.data)
      setBriefAnswers(answersToMap(submissionResult.answers))
      setBriefLoading(false)
    }
    void loadBrief()
    return () => {
      active = false
    }
  }, [open, project.id, initialPrice, initialDeadline])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !generating && !saving) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, generating, saving, onClose])

  if (!open) {
    return null
  }

  const updateSection = (
    index: number,
    patch: Partial<ProposalAiSectionDraft>,
  ) => {
    setSections((prev) =>
      prev.map((section, i) =>
        i === index ? { ...section, ...patch } : section,
      ),
    )
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    const next = index + direction
    if (next < 0 || next >= sections.length) return
    setSections((prev) => {
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(next, 0, item)
      return copy
    })
  }

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index))
  }

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        sectionType: 'scope',
        title: 'Новая секция',
        content: '',
        visible: true,
      },
    ])
  }

  const currentDraft = (): ProposalAiDraft => ({
    title,
    subtitle,
    intro,
    sections,
  })

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    const result = await generateProposalWithAi({
      projectId: project.id,
      price,
      deadline,
      comment,
      proposalStyle,
    })
    setGenerating(false)

    if (!result.ok || !result.draft) {
      setError(
        formatProposalAiErrorForUi(result.details, result.error) ||
          result.error ||
          'Не удалось сгенерировать КП.',
      )
      return
    }

    setTitle(result.draft.title)
    setSubtitle(result.draft.subtitle)
    setIntro(result.draft.intro)
    setSections(result.draft.sections)
    setModel(result.model)
    setStep('preview')
  }

  const handleApply = async () => {
    if (sections.length === 0) {
      showToast('Нет секций для сохранения', 'error')
      return
    }
    setSaving(true)
    const draft = currentDraft()
    const result = await applyProposalAiDraft(project.id, draft, {
      price,
      deadline,
    })
    if (!result.ok) {
      setSaving(false)
      showToast(result.error ?? 'Не удалось сохранить КП', 'error')
      return
    }

    await logProposalAiGeneration({
      projectId: project.id,
      proposalStyle,
      hasPrice: Boolean(price.trim()),
      hasDeadline: Boolean(deadline.trim()),
      commentLength: comment.trim().length,
      briefAnswersCount: Object.keys(briefAnswers).length,
      model,
      draft,
    })

    setSaving(false)
    showToast('Вариант КП сохранён (черновик, не опубликован)', 'success')
    onApplied()
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        aria-label="Закрыть"
        onClick={() => {
          if (!generating && !saving) onClose()
        }}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-card sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Сгенерировать КП с ИИ
            </h2>
            <p className="mt-1 text-sm text-muted">
              Preview только. В базу попадёт после «Использовать этот вариант».
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-border p-2 text-muted hover:text-ink"
            onClick={onClose}
            disabled={generating || saving}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 'form' ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-soft/40 p-4 text-sm">
                <p className="text-xs font-medium tracking-[0.08em] text-muted uppercase">
                  Контекст (только чтение)
                </p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Клиент</dt>
                    <dd className="text-ink">{project.client?.name || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Компания</dt>
                    <dd className="text-ink">
                      {project.client?.company || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Проект</dt>
                    <dd className="text-ink">{project.title}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Тип</dt>
                    <dd className="text-ink">{project.projectType}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Описание</dt>
                    <dd className="whitespace-pre-wrap text-ink">
                      {project.description || '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Задача</dt>
                    <dd className="whitespace-pre-wrap text-ink">
                      {project.task || '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-medium tracking-[0.08em] text-muted uppercase">
                  Ответы брифа
                </p>
                {briefLoading ? (
                  <p className="mt-3 text-sm text-muted">Загрузка...</p>
                ) : briefFields.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    Вопросов брифа пока нет.
                  </p>
                ) : (
                  <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
                    {briefFields.map((field) => (
                      <li key={field.id} className="border-b border-border/60 pb-2">
                        <p className="font-medium text-ink">{field.label}</p>
                        <p className="text-muted">
                          {displayAnswer(briefAnswers[field.fieldKey])}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted">
                    Стоимость (задаёте вы)
                  </label>
                  <input
                    className={fieldClass}
                    value={price}
                    placeholder="например, от 120 000 ₽"
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted">
                    Срок (задаёте вы)
                  </label>
                  <input
                    className={fieldClass}
                    value={deadline}
                    placeholder="например, 4–6 недель"
                    onChange={(event) => setDeadline(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted">
                  Комментарий для ИИ
                </label>
                <textarea
                  className={fieldClass}
                  rows={3}
                  placeholder="Акцент на объём работ, интеграции, формат сотрудничества…"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted">
                  Стиль КП
                </label>
                <select
                  className={fieldClass}
                  value={proposalStyle}
                  onChange={(event) =>
                    setProposalStyle(event.target.value as ProposalAiStyle)
                  }
                >
                  {PROPOSAL_AI_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {PROPOSAL_AI_STYLE_LABELS[style]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs text-muted">Заголовок</label>
                  <input
                    className={fieldClass}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs text-muted">Подзаголовок</label>
                  <input
                    className={fieldClass}
                    value={subtitle}
                    onChange={(event) => setSubtitle(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs text-muted">Вступление</label>
                  <textarea
                    className={fieldClass}
                    rows={3}
                    value={intro}
                    onChange={(event) => setIntro(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">Секции preview</p>
                <Button type="button" variant="ghost" onClick={addSection}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Добавить
                </Button>
              </div>

              {sections.length === 0 ? (
                <p className="text-sm text-muted">
                  Нет секций. Сгенерируйте заново или добавьте вручную.
                </p>
              ) : (
                sections.map((section, index) => (
                  <div
                    key={`${section.sectionType}-${index}`}
                    className="space-y-3 rounded-xl border border-border p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        Секция {index + 1}
                      </p>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-border p-2 text-muted hover:text-ink"
                          onClick={() =>
                            updateSection(index, {
                              visible: !section.visible,
                            })
                          }
                          title={section.visible ? 'Скрыть' : 'Показать'}
                        >
                          {section.visible ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border p-2 text-muted hover:text-ink disabled:opacity-40"
                          disabled={index === 0}
                          onClick={() => moveSection(index, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border p-2 text-muted hover:text-ink disabled:opacity-40"
                          disabled={index === sections.length - 1}
                          onClick={() => moveSection(index, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border p-2 text-muted hover:text-red-500"
                          onClick={() => removeSection(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="block text-xs text-muted">Тип</label>
                        <select
                          className={fieldClass}
                          value={section.sectionType}
                          onChange={(event) =>
                            updateSection(index, {
                              sectionType: event.target
                                .value as ProposalSectionType,
                            })
                          }
                        >
                          {PROPOSAL_SECTION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {PROPOSAL_SECTION_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs text-muted">
                          Заголовок
                        </label>
                        <input
                          className={fieldClass}
                          value={section.title}
                          onChange={(event) =>
                            updateSection(index, {
                              title: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block text-xs text-muted">
                          Содержание
                        </label>
                        <textarea
                          className={fieldClass}
                          rows={4}
                          value={section.content}
                          onChange={(event) =>
                            updateSection(index, {
                              content: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}

              <p className="text-xs text-muted">
                Цена и срок при сохранении берутся из полей администратора
                {price.trim() || deadline.trim()
                  ? `: ${[price.trim(), deadline.trim()].filter(Boolean).join(' · ')}`
                  : ' (сейчас пусто — ИИ не должен был их придумывать).'}
              </p>
            </div>
          )}

          {error ? (
            <p
              role="alert"
              className="mt-4 whitespace-pre-wrap rounded-xl border border-red-300/50 bg-soft px-4 py-3 font-mono text-xs leading-relaxed text-ink"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          {step === 'form' ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={generating}
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating}
              >
                {generating ? 'Генерация...' : 'Сгенерировать'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={saving || generating}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleGenerate()}
                disabled={saving || generating}
              >
                {generating ? 'Генерация...' : 'Сгенерировать заново'}
              </Button>
              <Button
                type="button"
                onClick={() => void handleApply()}
                disabled={saving || generating || sections.length === 0}
              >
                {saving ? 'Сохранение...' : 'Использовать этот вариант'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
