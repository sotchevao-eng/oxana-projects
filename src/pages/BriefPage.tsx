import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { ThemeToggle } from '../components/ThemeToggle'
import { useSiteSettings } from '../hooks/useSiteSettings'
import {
  fetchPublicBrief,
  savePublicBriefDraft,
  submitPublicBrief,
} from '../services/briefService'
import type { BriefAnswersMap, PublicBriefPayload } from '../types/brief'
import {
  calcBriefProgress,
  isAnswerFilled,
} from '../utils/briefVariables'

const fieldClass =
  'w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted focus:border-accent/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-70'

function normalizeOptions(value: unknown): string[] {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item))
  }
  return []
}

export function BriefPage() {
  const { token = '' } = useParams()
  const { settings } = useSiteSettings()
  const [payload, setPayload] = useState<PublicBriefPayload | null>(null)
  const [answers, setAnswers] = useState<BriefAnswersMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const submitted =
    done || payload?.submission?.status === 'submitted'

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const result = await fetchPublicBrief(token)
      if (!active) {
        return
      }
      if (!result.data?.ok) {
        setPayload(result.data)
        setError(result.error ?? 'Ссылка недействительна.')
        setLoading(false)
        return
      }
      setPayload(result.data)
      setAnswers(result.data.answers ?? {})
      setError(null)
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  const fields = payload?.fields ?? []
  const progress = useMemo(
    () =>
      calcBriefProgress(
        fields.map((field) => ({
          fieldKey: field.fieldKey,
          required: field.required,
        })),
        answers,
      ),
    [fields, answers],
  )

  const setAnswer = (key: string, value: BriefAnswersMap[string]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const validateRequired = (): boolean => {
    const nextErrors: Record<string, string> = {}
    for (const field of fields) {
      if (field.required && !isAnswerFilled(answers[field.fieldKey])) {
        nextErrors[field.fieldKey] = 'Обязательное поле'
      }
    }
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSaveDraft = async () => {
    if (submitted || saving) {
      return
    }
    setSaving(true)
    const result = await savePublicBriefDraft(token, answers)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Не удалось сохранить. Попробуйте ещё раз.')
      return
    }
    setError(null)
  }

  const handleSubmit = async () => {
    if (submitted || submitting) {
      return
    }
    if (!validateRequired()) {
      setError('Заполните все обязательные поля.')
      return
    }
    setSubmitting(true)
    const result = await submitPublicBrief(token, answers)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Не удалось сохранить. Попробуйте ещё раз.')
      return
    }
    setDone(true)
    setError(null)
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">Загрузка брифа...</p>
      </div>
    )
  }

  if (!payload?.ok || !payload.project) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Ссылка недействительна
        </h1>
        <p className="text-sm text-muted">
          {error ?? 'Проверьте ссылку или запросите новую у автора проекта.'}
        </p>
        <Button to="/" variant="secondary">
          На главную
        </Button>
      </div>
    )
  }

  if (submitted && done) {
    return (
      <BriefShell siteName={settings.siteName}>
        <div className="rounded-[2rem] border border-border bg-surface p-8 text-center shadow-card md:p-12">
          <p className="font-display text-2xl font-medium tracking-tight md:text-3xl">
            Спасибо! Бриф отправлен.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted md:text-base">
            Я изучу ответы и подготовлю предложение.
          </p>
        </div>
      </BriefShell>
    )
  }

  return (
    <BriefShell siteName={settings.siteName}>
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-surface/90 p-6 shadow-card backdrop-blur-sm md:p-8">
          <p className="text-xs font-medium tracking-[0.14em] text-accent uppercase">
            Бриф проекта
          </p>
          <h1 className="mt-3 font-display text-2xl font-medium tracking-tight md:text-3xl">
            {payload.project.title}
          </h1>
          {payload.project.clientName ? (
            <p className="mt-2 text-sm text-muted">
              Для {payload.project.clientName}
            </p>
          ) : null}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            Расскажите о задаче подробнее — это поможет подготовить точное
            предложение. Можно сохранить черновик и вернуться позже по той же
            ссылке.
          </p>

          {submitted ? (
            <p className="mt-5 inline-flex rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-ink">
              Бриф отправлен
            </p>
          ) : (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Прогресс заполнения</span>
                <span>
                  {progress.filled} / {progress.total} · {progress.percent}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-soft">
                <div
                  className="h-full rounded-full bg-brand-gradient transition-all duration-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {error ? (
          <p className="rounded-2xl border border-red-300/50 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {fields.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-border px-6 py-12 text-center text-sm text-muted">
            Бриф ещё готовится. Загляните позже.
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map((field, index) => {
              const value = answers[field.fieldKey]
              const options = normalizeOptions(field.options)
              const disabled = submitted

              return (
                <div
                  key={field.id}
                  className="rounded-[1.5rem] border border-border bg-surface/95 p-5 md:p-6"
                >
                  <label className="block text-sm font-medium text-ink">
                    {index + 1}. {field.label}
                    {field.required ? (
                      <span className="ml-1 text-accent">*</span>
                    ) : null}
                  </label>
                  {field.helpText ? (
                    <p className="mt-1 text-xs text-muted">{field.helpText}</p>
                  ) : null}

                  <div className="mt-3">
                    {field.fieldType === 'long_text' ? (
                      <textarea
                        className={fieldClass}
                        rows={4}
                        disabled={disabled}
                        placeholder={field.placeholder ?? undefined}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) =>
                          setAnswer(field.fieldKey, event.target.value)
                        }
                      />
                    ) : field.fieldType === 'checkbox' ? (
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          disabled={disabled}
                          checked={Boolean(value)}
                          onChange={(event) =>
                            setAnswer(field.fieldKey, event.target.checked)
                          }
                        />
                        <span>{field.placeholder || 'Да'}</span>
                      </label>
                    ) : field.fieldType === 'single_select' ? (
                      <select
                        className={fieldClass}
                        disabled={disabled}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) =>
                          setAnswer(field.fieldKey, event.target.value)
                        }
                      >
                        <option value="">Выберите вариант</option>
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.fieldType === 'multi_select' ? (
                      <div className="space-y-2">
                        {options.map((option) => {
                          const selected = Array.isArray(value)
                            ? value.includes(option)
                            : false
                          return (
                            <label
                              key={option}
                              className="flex items-center gap-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border"
                                disabled={disabled}
                                checked={selected}
                                onChange={(event) => {
                                  const current = Array.isArray(value)
                                    ? value
                                    : []
                                  setAnswer(
                                    field.fieldKey,
                                    event.target.checked
                                      ? [...current, option]
                                      : current.filter((item) => item !== option),
                                  )
                                }}
                              />
                              <span>{option}</span>
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      <input
                        className={fieldClass}
                        disabled={disabled}
                        type={
                          field.fieldType === 'email'
                            ? 'email'
                            : field.fieldType === 'number'
                              ? 'number'
                              : field.fieldType === 'date'
                                ? 'date'
                                : field.fieldType === 'url'
                                  ? 'url'
                                  : field.fieldType === 'phone'
                                    ? 'tel'
                                    : 'text'
                        }
                        placeholder={field.placeholder ?? undefined}
                        value={
                          typeof value === 'string' || typeof value === 'number'
                            ? String(value)
                            : ''
                        }
                        onChange={(event) =>
                          setAnswer(
                            field.fieldKey,
                            field.fieldType === 'number'
                              ? event.target.value === ''
                                ? ''
                                : Number(event.target.value)
                              : event.target.value,
                          )
                        }
                      />
                    )}
                  </div>
                  {fieldErrors[field.fieldKey] ? (
                    <p className="mt-2 text-xs text-red-500">
                      {fieldErrors[field.fieldKey]}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {!submitted && fields.length > 0 ? (
          <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-[1.5rem] border border-border bg-surface/95 p-4 shadow-card backdrop-blur-md sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={saving || submitting}
              onClick={() => void handleSaveDraft()}
            >
              {saving ? 'Сохранение...' : 'Сохранить черновик'}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={saving || submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? 'Отправка...' : 'Отправить бриф'}
            </Button>
          </div>
        ) : null}
      </div>
    </BriefShell>
  )
}

function BriefShell({
  siteName,
  children,
}: {
  siteName: string
  children: ReactNode
}) {
  return (
    <div className="relative mx-auto min-h-[70vh] max-w-3xl px-6 py-10 md:px-10 md:py-14">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="font-display text-sm font-medium tracking-[0.08em] text-brand-gradient"
        >
          {siteName || 'OXANA PROJECTS'}
        </Link>
        <ThemeToggle />
      </div>
      {children}
    </div>
  )
}
