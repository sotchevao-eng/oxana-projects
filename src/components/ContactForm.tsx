import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { contactProjectTypeOptions } from '../data/contactForm'
import {
  CONTACT_FIELD_LIMITS,
  emptyContactForm,
  submitContactRequest,
  validateContactForm,
} from '../services/contactService'
import type { ContactFormData, ContactFormErrors } from '../types/contact'
import { Button } from './Button'

const fieldClassName =
  'w-full rounded-2xl border bg-surface px-4 py-3.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted focus:border-accent/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60'

function fieldBorder(hasError: boolean): string {
  return hasError ? 'border-red-300' : 'border-border'
}

export function ContactForm() {
  const [form, setForm] = useState<ContactFormData>(emptyContactForm)
  const [errors, setErrors] = useState<ContactFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [savedLocally, setSavedLocally] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const updateField = <K extends keyof ContactFormData>(
    key: K,
    value: ContactFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      if (key === 'email' || key === 'phoneOrTelegram') {
        delete next.contact
      }
      return next
    })
    setSubmitError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    const nextErrors = validateContactForm(form)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    const result = await submitContactRequest(form)

    setIsSubmitting(false)

    if (!result.ok) {
      setSubmitError(result.error ?? 'Не удалось отправить заявку')
      return
    }

    setIsSuccess(true)
    setSavedLocally(Boolean(result.savedLocally))
    setForm(emptyContactForm)
    setErrors({})
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-[320px] flex-col items-start justify-center gap-4">
        <p className="font-display text-2xl font-medium tracking-tight md:text-3xl">
          Спасибо! Заявка отправлена.
        </p>
        <p className="max-w-md text-sm leading-relaxed text-muted md:text-base">
          {savedLocally
            ? 'Соединение с сервером недоступно, заявка сохранена локально. Я отвечу, как только смогу получить обращение.'
            : 'Я посмотрю задачу и отвечу удобным способом связи.'}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsSuccess(false)
            setSavedLocally(false)
          }}
        >
          Отправить ещё одну
        </Button>
      </div>
    )
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)} noValidate>
      {/* Honeypot — скрыто от пользователей, ловит автоматические заполнения */}
      <div
        className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <label htmlFor="contact-website">Сайт</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => updateField('website', event.target.value)}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="contact-name" className="text-sm text-ink">
            Имя <span className="text-muted">*</span>
          </label>
          <input
            id="contact-name"
            name="name"
            value={form.name}
            maxLength={CONTACT_FIELD_LIMITS.name}
            disabled={isSubmitting}
            onChange={(event) => updateField('name', event.target.value)}
            className={`${fieldClassName} ${fieldBorder(Boolean(errors.name))}`}
            placeholder="Как к вам обращаться"
            autoComplete="name"
          />
          {errors.name && (
            <p className="text-xs text-red-500">{errors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="contact-company" className="text-sm text-ink">
            Компания
          </label>
          <input
            id="contact-company"
            name="company"
            value={form.company}
            maxLength={CONTACT_FIELD_LIMITS.company}
            disabled={isSubmitting}
            onChange={(event) => updateField('company', event.target.value)}
            className={`${fieldClassName} ${fieldBorder(Boolean(errors.company))}`}
            placeholder="Если есть"
            autoComplete="organization"
          />
          {errors.company ? (
            <p className="text-xs text-red-500">{errors.company}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="contact-email" className="text-sm text-ink">
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            value={form.email}
            maxLength={CONTACT_FIELD_LIMITS.email}
            disabled={isSubmitting}
            onChange={(event) => updateField('email', event.target.value)}
            className={`${fieldClassName} ${fieldBorder(
              Boolean(errors.email || errors.contact),
            )}`}
            placeholder="you@email.com"
            autoComplete="email"
          />
          {errors.email && (
            <p className="text-xs text-red-500">{errors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="contact-phone" className="text-sm text-ink">
            Телефон / Telegram
          </label>
          <input
            id="contact-phone"
            name="phoneOrTelegram"
            value={form.phoneOrTelegram}
            maxLength={CONTACT_FIELD_LIMITS.phoneOrTelegram}
            disabled={isSubmitting}
            onChange={(event) =>
              updateField('phoneOrTelegram', event.target.value)
            }
            className={`${fieldClassName} ${fieldBorder(
              Boolean(errors.contact || errors.phoneOrTelegram),
            )}`}
            placeholder="+7... или @username"
            autoComplete="tel"
          />
          {errors.phoneOrTelegram ? (
            <p className="text-xs text-red-500">{errors.phoneOrTelegram}</p>
          ) : null}
        </div>
      </div>

      {errors.contact && (
        <p className="text-xs text-red-500">{errors.contact}</p>
      )}

      <div className="space-y-2">
        <label htmlFor="contact-project-type" className="text-sm text-ink">
          Тип проекта
        </label>
        <select
          id="contact-project-type"
          name="projectType"
          value={form.projectType}
          disabled={isSubmitting}
          onChange={(event) =>
            updateField(
              'projectType',
              event.target.value as ContactFormData['projectType'],
            )
          }
          className={`${fieldClassName} ${fieldBorder(false)} appearance-none`}
        >
          <option value="">Выберите тип</option>
          {contactProjectTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="contact-description" className="text-sm text-ink">
          Описание задачи <span className="text-muted">*</span>
        </label>
        <textarea
          id="contact-description"
          name="description"
          rows={5}
          value={form.description}
          maxLength={CONTACT_FIELD_LIMITS.description}
          disabled={isSubmitting}
          onChange={(event) => updateField('description', event.target.value)}
          className={`${fieldClassName} ${fieldBorder(Boolean(errors.description))} resize-y`}
          placeholder="Коротко: что нужно сделать и какой результат важен"
        />
        {errors.description && (
          <p className="text-xs text-red-500">{errors.description}</p>
        )}
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-soft/40 p-4">
        <label className="flex items-start gap-3 text-sm leading-relaxed text-muted">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-[var(--theme-accent)]"
            checked={form.consent}
            disabled={isSubmitting}
            onChange={(event) => updateField('consent', event.target.checked)}
          />
          <span>
            Я согласен(на) с обработкой персональных данных и принимаю{' '}
            <Link
              to="/privacy"
              className="text-ink underline decoration-accent/50 underline-offset-2 transition-colors hover:text-accent"
            >
              Политику конфиденциальности
            </Link>
            . <span className="text-muted">*</span>
          </span>
        </label>
        {errors.consent ? (
          <p className="text-xs text-red-500">{errors.consent}</p>
        ) : null}
      </div>

      {submitError && <p className="text-sm text-red-500">{submitError}</p>}

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting}
        className="min-w-[10rem]"
      >
        {isSubmitting ? 'Отправляем...' : 'Отправить'}
      </Button>
    </form>
  )
}
