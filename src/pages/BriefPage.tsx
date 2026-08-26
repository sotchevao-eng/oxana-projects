import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { ThemeToggle } from '../components/ThemeToggle'
import { useToast } from '../components/ToastProvider'
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
  'w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-base text-ink outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted focus:border-accent/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-70 md:text-sm'

function normalizeOptions(value: unknown): string[] {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item))
  }
  return []
}

function normalizeAnswers(raw: BriefAnswersMap | undefined): BriefAnswersMap {
  if (!raw) {
    return {}
  }
  const next: BriefAnswersMap = {}
  for (const [key, value] of Object.entries(raw)) {
    next[key] = value as BriefAnswersMap[string]
  }
  return next
}

export function BriefPage() {
  const { token = '' } = useParams()
  const { settings } = useSiteSettings()
  const { showToast } = useToast()
  const [payload, setPayload] = useState<PublicBriefPayload | null>(null)
  const [answers, setAnswers] = useState<BriefAnswersMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const formTopRef = useRef<HTMLDivElement | null>(null)

  const submitted =
    done || payload?.submission?.status === 'submitted'
  const isDraft = payload?.submission?.status === 'draft' && !submitted
  const privacyPolicyPath = '/privacy'
  const collectsPersonalData = (payload?.fields ?? []).some(
    (field) =>
      Boolean(field.isPersonalData) ||
      field.fieldType === 'email' ||
      field.fieldType === 'phone',
  )

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!token || token.trim().length < 16) {
        setPayload(null)
        setError('Ссылка недействительна.')
        setLoading(false)
        return
      }

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
      setAnswers(normalizeAnswers(result.data.answers))
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
    setSuccess(null)
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
        nextErrors[field.fieldKey] = 'Это поле обязательно'
      }
    }
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const scrollToErrors = () => {
    window.requestAnimationFrame(() => {
      const first = document.querySelector('[data-brief-error="true"]')
      if (first instanceof HTMLElement) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleSaveDraft = async () => {
    if (submitted || saving || submitting) {
      return
    }
    setSaving(true)
    setError(null)
    const result = await savePublicBriefDraft(token, answers)
    setSaving(false)
    if (!result.ok) {
      setSuccess(null)
      setError(result.error ?? 'Не удалось сохранить. Попробуйте ещё раз.')
      return
    }
    setPayload((prev) =>
      prev
        ? {
            ...prev,
            submission: {
              status: 'draft',
              submittedAt: null,
              updatedAt: new Date().toISOString(),
            },
          }
        : prev,
    )
    setSuccess('Черновик сохранён. Можно вернуться по этой же ссылке позже.')
    showToast('Черновик сохранён', 'success')
  }

  const handleSubmit = async () => {
    if (submitted || submitting || saving) {
      return
    }
    if (!validateRequired()) {
      setSuccess(null)
      setError('Заполните все обязательные поля.')
      scrollToErrors()
      return
    }
    if (collectsPersonalData && !privacyConsent) {
      setSuccess(null)
      setError(
        'Подтвердите согласие на обработку персональных данных перед отправкой.',
      )
      scrollToErrors()
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await submitPublicBrief(token, answers)
    setSubmitting(false)
    if (!result.ok) {
      setSuccess(null)
      setError(result.error ?? 'Не удалось сохранить. Попробуйте ещё раз.')
      if (result.missing?.length) {
        scrollToErrors()
      }
      return
    }
    setDone(true)
    setSuccess(null)
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
      <BriefShell siteName={settings.siteName}>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <h1 className="font-display text-2xl font-medium tracking-tight">
            Ссылка недействительна
          </h1>
          <p className="max-w-md text-sm text-muted">
            {error ?? 'Проверьте ссылку или запросите новую у автора проекта.'}
          </p>
          <Button to="/" variant="secondary">
            На главную
          </Button>
        </div>
      </BriefShell>
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
      <div className="space-y-6 pb-28 sm:pb-8" ref={formTopRef}>
        <div className="rounded-[2rem] border border-border bg-surface/90 p-5 shadow-card backdrop-blur-sm sm:p-6 md:p-8">
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
              Бриф отправлен · ответы только для просмотра
            </p>
          ) : (
            <div className="mt-6 space-y-2">
              {isDraft ? (
                <p className="text-xs text-muted">
                  Найден сохранённый черновик — можете продолжить заполнение.
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span>Прогресс заполнения</span>
                <span className="shrink-0">
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
          <p
            role="alert"
            className="rounded-2xl border border-red-300/60 bg-[color-mix(in_srgb,#ef4444_10%,var(--color-surface))] px-4 py-3 text-sm text-ink"
          >
            {error}
          </p>
        ) : null}

        {success ? (
          <p
            role="status"
            className="rounded-2xl border border-accent/35 bg-accent/10 px-4 py-3 text-sm text-ink"
          >
            {success}
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
              const hasError = Boolean(fieldErrors[field.fieldKey])

              return (
                <div
                  key={field.id}
                  data-brief-error={hasError ? 'true' : undefined}
                  className={`rounded-[1.5rem] border bg-surface/95 p-4 sm:p-5 md:p-6 ${
                    hasError ? 'border-red-400/70' : 'border-border'
                  }`}
                >
                  <label className="block text-sm font-medium text-ink">
                    {index + 1}. {field.label}
                    {field.required ? (
                      <span className="ml-1 text-accent">*</span>
                    ) : null}
                    {field.isPersonalData ||
                    field.fieldType === 'email' ||
                    field.fieldType === 'phone' ? (
                      <span className="ml-2 inline-flex items-center rounded-full border border-border bg-soft px-2 py-0.5 text-[11px] font-medium text-muted">
                        🔒 Не передаётся в ИИ
                      </span>
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
                      <label className="flex min-h-11 items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-border"
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
                              className="flex min-h-11 items-center gap-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                className="h-5 w-5 rounded border-border"
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
                        inputMode={
                          field.fieldType === 'phone'
                            ? 'tel'
                            : field.fieldType === 'number'
                              ? 'decimal'
                              : field.fieldType === 'email'
                                ? 'email'
                                : undefined
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

        {fields.length > 0 ? (
          <p className="rounded-2xl border border-border bg-soft/40 px-4 py-3 text-xs leading-relaxed text-muted">
            Персональные данные используются для обработки заявки и подготовки
            документов. Они исключаются из данных, передаваемых в систему ИИ.
          </p>
        ) : null}

        {!submitted && fields.length > 0 && collectsPersonalData ? (
          <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border"
              checked={privacyConsent}
              onChange={(event) => setPrivacyConsent(event.target.checked)}
            />
            <span>
              Я даю согласие на обработку персональных данных и ознакомлен(а) с{' '}
              <Link
                to={privacyPolicyPath}
                className="text-accent underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Политикой обработки персональных данных
              </Link>
              .
            </span>
          </label>
        ) : null}

        {!submitted && fields.length > 0 ? (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:rounded-[1.5rem] sm:border sm:p-4 sm:shadow-card">
            <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:gap-3">
              <Button
                type="button"
                variant="secondary"
                className="min-h-12 flex-1"
                disabled={saving || submitting}
                onClick={() => void handleSaveDraft()}
              >
                {saving ? 'Сохранение...' : 'Сохранить черновик'}
              </Button>
              <Button
                type="button"
                className="min-h-12 flex-1"
                disabled={saving || submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? 'Отправка...' : 'Отправить бриф'}
              </Button>
            </div>
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
    <div className="relative mx-auto min-h-[70vh] max-w-3xl px-4 py-8 sm:px-6 sm:py-10 md:px-10 md:py-14">
      <div className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
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
