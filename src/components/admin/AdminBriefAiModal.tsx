import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import { Button } from '../Button'
import { ConfirmDialog } from '../ConfirmDialog'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useToast } from '../ToastProvider'
import type { ClientProject } from '../../types/clientProject'
import type { BriefAiFieldDraft } from '../../types/briefAi'
import {
  BRIEF_FIELD_TYPE_LABELS,
  BRIEF_FIELD_TYPES,
} from '../../types/brief'
import { generateBriefWithAi } from '../../services/briefAiService'
import {
  appendBriefFields,
  replaceBriefFields,
} from '../../services/briefService'
import { ensureUniqueFieldKey, isValidFieldKey, slugifyFieldKey } from '../../utils/fieldKey'
import { formatAiErrorForUi } from '../../utils/briefAiValidate'

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50'

function sanitizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function toInput(field: BriefAiFieldDraft, sortOrder: number) {
  return {
    label: field.label,
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    placeholder: field.placeholder,
    helpText: field.helpText,
    required: field.required,
    options: field.options,
    sortOrder,
  }
}

interface AdminBriefAiModalProps {
  open: boolean
  project: ClientProject
  existingKeys: string[]
  onClose: () => void
  onApplied: () => void
}

export function AdminBriefAiModal({
  open,
  project,
  existingKeys,
  onClose,
  onApplied,
}: AdminBriefAiModalProps) {
  const { showToast } = useToast()
  useScrollLock(open)

  const [step, setStep] = useState<'form' | 'preview'>('form')
  const [projectType, setProjectType] = useState(project.projectType)
  const [description, setDescription] = useState(project.description ?? '')
  const [task, setTask] = useState(project.task ?? '')
  const [aiComment, setAiComment] = useState('')
  const [questionsCount, setQuestionsCount] = useState(10)
  const [title, setTitle] = useState('')
  const [intro, setIntro] = useState('')
  const [fields, setFields] = useState<BriefAiFieldDraft[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setStep('form')
    setProjectType(project.projectType)
    setDescription(project.description ?? '')
    setTask(project.task ?? '')
    setAiComment('')
    setQuestionsCount(10)
    setTitle('')
    setIntro('')
    setFields([])
    setError(null)
    setConfirmReplace(false)
  }, [open, project])

  useEffect(() => {
    if (!open) {
      return
    }
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

  const updateField = (index: number, patch: Partial<BriefAiFieldDraft>) => {
    setFields((prev) =>
      prev.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    )
  }

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    const result = await generateBriefWithAi(
      {
        projectId: project.id,
        projectType,
        description,
        task,
        aiComment,
        questionsCount,
      },
      [],
    )
    setGenerating(false)

    if (!result.ok || !result.draft) {
      setError(
        formatAiErrorForUi(result.details, result.error) ||
          result.error ||
          'Не удалось сгенерировать бриф.',
      )
      return
    }

    setTitle(result.draft.title)
    setIntro(result.draft.intro)
    setFields(result.draft.fields)
    setStep('preview')
  }

  const prepareFieldsForSave = (mode: 'append' | 'replace') => {
    const used =
      mode === 'append' ? [...existingKeys] : ([] as string[])
    const prepared = []

    for (const field of fields) {
      const label = field.label.trim()
      if (!label) continue

      let key = sanitizeKey(field.fieldKey) || slugifyFieldKey(label)
      if (!isValidFieldKey(key)) {
        key = slugifyFieldKey(label)
      }
      key = ensureUniqueFieldKey(key, used)
      used.push(key)

      prepared.push(
        toInput(
          {
            ...field,
            label,
            fieldKey: key,
            options: field.options.filter(Boolean),
          },
          prepared.length,
        ),
      )
    }

    return prepared
  }

  const handleAppend = async () => {
    const prepared = prepareFieldsForSave('append')
    if (prepared.length === 0) {
      showToast('Нет вопросов для сохранения', 'error')
      return
    }
    setSaving(true)
    const result = await appendBriefFields(project.id, prepared)
    setSaving(false)
    if (!result.ok) {
      showToast(result.error ?? 'Не удалось сохранить', 'error')
      return
    }
    showToast(`Добавлено вопросов: ${result.added}`, 'success')
    onApplied()
    onClose()
  }

  const handleReplace = async () => {
    const prepared = prepareFieldsForSave('replace')
    if (prepared.length === 0) {
      showToast('Нет вопросов для сохранения', 'error')
      return
    }
    setSaving(true)
    const result = await replaceBriefFields(project.id, prepared)
    setSaving(false)
    setConfirmReplace(false)
    if (!result.ok) {
      showToast(result.error ?? 'Не удалось сохранить', 'error')
      return
    }
    showToast(`Бриф заменён · вопросов: ${result.added}`, 'success')
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
              Сгенерировать бриф с ИИ
            </h2>
            <p className="mt-1 text-sm text-muted">
              Preview только. В бриф попадёт после вашего подтверждения.
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
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted">
                  Тип проекта
                </label>
                <input
                  className={fieldClass}
                  value={projectType}
                  onChange={(event) => setProjectType(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted">
                  Описание проекта
                </label>
                <textarea
                  className={fieldClass}
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted">
                  Задача
                </label>
                <textarea
                  className={fieldClass}
                  rows={3}
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted">
                  Комментарий для ИИ
                </label>
                <textarea
                  className={fieldClass}
                  rows={3}
                  placeholder="Например: больше про контент и интеграции, меньше про дизайн"
                  value={aiComment}
                  onChange={(event) => setAiComment(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted">
                  Желаемое количество вопросов (5–20)
                </label>
                <input
                  type="number"
                  min={5}
                  max={20}
                  className={fieldClass}
                  value={questionsCount}
                  onChange={(event) =>
                    setQuestionsCount(
                      Math.min(20, Math.max(5, Number(event.target.value) || 10)),
                    )
                  }
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {(title || intro) && (
                <div className="rounded-xl border border-border bg-soft/50 p-4">
                  {title ? (
                    <p className="font-medium text-ink">{title}</p>
                  ) : null}
                  {intro ? (
                    <p className="mt-1 text-sm text-muted">{intro}</p>
                  ) : null}
                </div>
              )}

              {fields.length === 0 ? (
                <p className="text-sm text-muted">
                  Нет вопросов в preview. Сгенерируйте заново.
                </p>
              ) : (
                fields.map((field, index) => (
                  <div
                    key={`${field.fieldKey}-${index}`}
                    className="space-y-3 rounded-xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        Вопрос {index + 1}
                      </p>
                      <button
                        type="button"
                        className="rounded-lg border border-border p-2 text-muted hover:text-red-500"
                        onClick={() => removeField(index)}
                        aria-label="Удалить вопрос"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block text-xs text-muted">Заголовок</label>
                        <input
                          className={fieldClass}
                          value={field.label}
                          onChange={(event) =>
                            updateField(index, { label: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs text-muted">field_key</label>
                        <input
                          className={fieldClass}
                          value={field.fieldKey}
                          onChange={(event) =>
                            updateField(index, {
                              fieldKey: sanitizeKey(event.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs text-muted">Тип</label>
                        <select
                          className={fieldClass}
                          value={field.fieldType}
                          onChange={(event) =>
                            updateField(index, {
                              fieldType: event.target.value,
                            })
                          }
                        >
                          {BRIEF_FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {BRIEF_FIELD_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs text-muted">
                          Placeholder
                        </label>
                        <input
                          className={fieldClass}
                          value={field.placeholder}
                          onChange={(event) =>
                            updateField(index, {
                              placeholder: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs text-muted">Подсказка</label>
                        <input
                          className={fieldClass}
                          value={field.helpText}
                          onChange={(event) =>
                            updateField(index, { helpText: event.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-6">
                        <input
                          id={`ai-required-${index}`}
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) =>
                            updateField(index, {
                              required: event.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-border"
                        />
                        <label
                          htmlFor={`ai-required-${index}`}
                          className="text-sm"
                        >
                          Обязательное
                        </label>
                      </div>
                      {field.fieldType === 'single_select' ||
                      field.fieldType === 'multi_select' ? (
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="block text-xs text-muted">
                            Варианты (с новой строки)
                          </label>
                          <textarea
                            className={fieldClass}
                            rows={3}
                            value={field.options.join('\n')}
                            onChange={(event) =>
                              updateField(index, {
                                options: event.target.value
                                  .split('\n')
                                  .map((line) => line.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
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
                onClick={() => setStep('form')}
                disabled={saving}
              >
                Назад
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleAppend()}
                disabled={saving || fields.length === 0}
              >
                {saving ? 'Сохранение...' : 'Добавить к текущему'}
              </Button>
              <Button
                type="button"
                onClick={() => setConfirmReplace(true)}
                disabled={saving || fields.length === 0}
              >
                Заменить текущий
              </Button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title="Заменить текущий бриф?"
        description="Все существующие вопросы брифа будут удалены и заменены на выбранные из preview."
        confirmLabel="Заменить"
        confirming={saving}
        onConfirm={() => void handleReplace()}
        onCancel={() => setConfirmReplace(false)}
      />
    </div>,
    document.body,
  )
}
