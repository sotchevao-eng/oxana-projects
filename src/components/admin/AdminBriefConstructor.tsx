import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '../Button'
import { useToast } from '../ToastProvider'
import type { ClientProject } from '../../types/clientProject'
import type { BriefField, BriefFieldInput } from '../../types/brief'
import {
  BRIEF_FIELD_TYPE_LABELS,
  BRIEF_FIELD_TYPES,
} from '../../types/brief'
import {
  applyWebsiteBriefTemplate,
  createBriefField,
  deleteBriefField,
  fetchBriefFields,
  reorderBriefFields,
  updateBriefField,
} from '../../services/briefService'
import { ensureUniqueFieldKey, isValidFieldKey, slugifyFieldKey } from '../../utils/fieldKey'
import {
  getBriefPublicUrl,
} from '../../utils/publicTokens'

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50'

function emptyInput(sortOrder: number): BriefFieldInput {
  return {
    label: '',
    fieldKey: '',
    fieldType: 'short_text',
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    sortOrder,
  }
}

function fieldToInput(field: BriefField): BriefFieldInput {
  return {
    label: field.label,
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    placeholder: field.placeholder ?? '',
    helpText: field.helpText ?? '',
    required: field.required,
    options: field.options ?? [],
    sortOrder: field.sortOrder,
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

interface AdminBriefConstructorProps {
  project: ClientProject
  onProjectStatusMaybeChanged?: () => void
}

export function AdminBriefConstructor({
  project,
  onProjectStatusMaybeChanged,
}: AdminBriefConstructorProps) {
  const { showToast } = useToast()
  const [fields, setFields] = useState<BriefField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<BriefFieldInput>(emptyInput(0))
  const [busy, setBusy] = useState(false)
  const [autoKey, setAutoKey] = useState(true)

  const briefUrl = getBriefPublicUrl(project.briefToken)

  const load = async () => {
    setLoading(true)
    const result = await fetchBriefFields(project.id)
    setFields(result.data)
    setError(result.error)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [project.id])

  const openNew = () => {
    setEditingId('new')
    setAutoKey(true)
    setDraft(emptyInput(fields.length))
  }

  const openEdit = (field: BriefField) => {
    setEditingId(field.id)
    setAutoKey(false)
    setDraft(fieldToInput(field))
  }

  const handleLabelChange = (label: string) => {
    setDraft((prev) => {
      const next = { ...prev, label }
      if (autoKey) {
        const existing = fields
          .filter((field) => field.id !== editingId)
          .map((field) => field.fieldKey)
        next.fieldKey = ensureUniqueFieldKey(slugifyFieldKey(label), existing)
      }
      return next
    })
  }

  const handleSave = async () => {
    if (busy) {
      return
    }
    if (!draft.label.trim()) {
      showToast('Укажите заголовок вопроса', 'error')
      return
    }
    if (!isValidFieldKey(draft.fieldKey)) {
      showToast('Ключ: только латиница, цифры и underscore', 'error')
      return
    }

    setBusy(true)
    const result =
      editingId === 'new'
        ? await createBriefField(project.id, draft)
        : await updateBriefField(editingId as string, draft)
    setBusy(false)

    if (!result.ok) {
      showToast(result.error ?? 'Ошибка сохранения', 'error')
      return
    }

    showToast(editingId === 'new' ? 'Вопрос добавлен' : 'Вопрос обновлён', 'success')
    setEditingId(null)
    await load()
    onProjectStatusMaybeChanged?.()
  }

  const handleDelete = async (fieldId: string) => {
    if (busy) {
      return
    }
    setBusy(true)
    const result = await deleteBriefField(fieldId)
    setBusy(false)
    if (!result.ok) {
      showToast(result.error ?? 'Не удалось удалить', 'error')
      return
    }
    showToast('Вопрос удалён', 'success')
    if (editingId === fieldId) {
      setEditingId(null)
    }
    await load()
  }

  const moveField = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= fields.length) {
      return
    }
    const next = [...fields]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    setFields(next)
    const result = await reorderBriefFields(next.map((field) => field.id))
    if (!result.ok) {
      showToast(result.error ?? 'Не удалось сохранить порядок', 'error')
      await load()
    }
  }

  const handleTemplate = async () => {
    setBusy(true)
    const result = await applyWebsiteBriefTemplate(
      project.id,
      fields.map((field) => field.fieldKey),
    )
    setBusy(false)
    if (!result.ok) {
      showToast(result.error ?? 'Не удалось добавить шаблон', 'error')
      return
    }
    showToast(
      result.added > 0
        ? `Добавлено вопросов: ${result.added}`
        : 'Базовый бриф уже добавлен',
      'success',
    )
    await load()
    onProjectStatusMaybeChanged?.()
  }

  const needsOptions =
    draft.fieldType === 'single_select' || draft.fieldType === 'multi_select'

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.06em] text-muted uppercase">
          Публичная ссылка
        </p>
        <p className="mt-2 break-all text-xs text-muted">{briefUrl}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void copyText(briefUrl).then((ok) =>
                showToast(
                  ok ? 'Ссылка на бриф скопирована' : 'Не удалось скопировать',
                  ok ? 'success' : 'error',
                ),
              )
            }
          >
            Скопировать ссылку
          </Button>
          <Button href={briefUrl} variant="ghost" external>
            Открыть бриф
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted">
          Вопросов: {fields.length}
          {fields.length > 0 ? ' · статус брифа зависит от ответов клиента' : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={openNew} disabled={busy}>
          <Plus className="mr-1.5 h-4 w-4" />
          Добавить вопрос
        </Button>
        {project.projectType === 'Сайт' ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleTemplate()}
            disabled={busy}
          >
            Добавить базовый бриф
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Загрузка вопросов...</p>
      ) : fields.length === 0 && editingId !== 'new' ? (
        <div className="rounded-xl border border-dashed border-border bg-soft/40 px-4 py-10 text-center text-sm text-muted">
          Пока нет вопросов. Добавьте первый или загрузите базовый шаблон.
        </div>
      ) : null}

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="rounded-xl border border-border bg-surface p-4"
          >
            {editingId === field.id ? (
              <BriefFieldEditor
                draft={draft}
                needsOptions={needsOptions}
                fieldClass={fieldClass}
                busy={busy}
                onChange={setDraft}
                onLabelChange={handleLabelChange}
                onKeyManual={(value) => {
                  setAutoKey(false)
                  setDraft((prev) => ({ ...prev, fieldKey: value }))
                }}
                onSave={() => void handleSave()}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-ink">
                    {index + 1}. {field.label}
                    {field.required ? (
                      <span className="ml-1 text-accent">*</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {field.fieldKey} ·{' '}
                    {BRIEF_FIELD_TYPE_LABELS[
                      field.fieldType as keyof typeof BRIEF_FIELD_TYPE_LABELS
                    ] ?? field.fieldType}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="rounded-lg border border-border p-2 text-muted hover:text-ink"
                    onClick={() => void moveField(index, -1)}
                    aria-label="Выше"
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-border p-2 text-muted hover:text-ink"
                    onClick={() => void moveField(index, 1)}
                    aria-label="Ниже"
                    disabled={index === fields.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => openEdit(field)}
                  >
                    Изменить
                  </Button>
                  <button
                    type="button"
                    className="rounded-lg border border-border p-2 text-muted hover:text-red-500"
                    onClick={() => void handleDelete(field.id)}
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {editingId === 'new' ? (
          <div className="rounded-xl border border-accent/40 bg-surface p-4">
            <BriefFieldEditor
              draft={draft}
              needsOptions={needsOptions}
              fieldClass={fieldClass}
              busy={busy}
              onChange={setDraft}
              onLabelChange={handleLabelChange}
              onKeyManual={(value) => {
                setAutoKey(false)
                setDraft((prev) => ({ ...prev, fieldKey: value }))
              }}
              onSave={() => void handleSave()}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function BriefFieldEditor({
  draft,
  needsOptions,
  fieldClass,
  busy,
  onChange,
  onLabelChange,
  onKeyManual,
  onSave,
  onCancel,
}: {
  draft: BriefFieldInput
  needsOptions: boolean
  fieldClass: string
  busy: boolean
  onChange: (value: BriefFieldInput) => void
  onLabelChange: (label: string) => void
  onKeyManual: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <label className="block text-xs font-medium text-muted">Заголовок</label>
          <input
            className={fieldClass}
            value={draft.label}
            onChange={(event) => onLabelChange(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted">
            Технический ключ
          </label>
          <input
            className={fieldClass}
            value={draft.fieldKey}
            onChange={(event) => onKeyManual(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted">Тип поля</label>
          <select
            className={fieldClass}
            value={draft.fieldType}
            onChange={(event) =>
              onChange({ ...draft, fieldType: event.target.value })
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
          <label className="block text-xs font-medium text-muted">
            Placeholder
          </label>
          <input
            className={fieldClass}
            value={draft.placeholder}
            onChange={(event) =>
              onChange({ ...draft, placeholder: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted">Подсказка</label>
          <input
            className={fieldClass}
            value={draft.helpText}
            onChange={(event) =>
              onChange({ ...draft, helpText: event.target.value })
            }
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            id="brief-required"
            type="checkbox"
            checked={draft.required}
            onChange={(event) =>
              onChange({ ...draft, required: event.target.checked })
            }
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="brief-required" className="text-sm text-ink">
            Обязательное поле
          </label>
        </div>
        {needsOptions ? (
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-muted">
              Варианты (каждый с новой строки)
            </label>
            <textarea
              className={fieldClass}
              rows={4}
              value={draft.options.join('\n')}
              onChange={(event) =>
                onChange({
                  ...draft,
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
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onSave} disabled={busy}>
          Сохранить вопрос
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Отмена
        </Button>
      </div>
    </div>
  )
}
