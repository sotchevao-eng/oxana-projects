import { useEffect, useState, type FormEvent } from 'react'
import { AdminHeroImageField } from '../../components/admin/AdminHeroImageField'
import { Button } from '../../components/Button'
import { DataStatus } from '../../components/DataStatus'
import { useToast } from '../../components/ToastProvider'
import {
  defaultSiteSettings,
  toSiteSettingsFormValues,
} from '../../data/siteSettings'
import { useSiteSettings } from '../../hooks/useSiteSettings'
import type { SiteSettingsFormValues } from '../../types/siteSettings'

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-60'

const fields: Array<{
  key: Exclude<keyof SiteSettingsFormValues, 'heroImage'>
  label: string
  required?: boolean
  multiline?: boolean
  placeholder?: string
  hint?: string
}> = [
  {
    key: 'siteName',
    label: 'Название сайта',
    required: true,
    placeholder: 'OXANA PROJECTS',
  },
  {
    key: 'subtitle',
    label: 'Подзаголовок',
    placeholder: 'Краткий слоган сайта',
  },
  {
    key: 'description',
    label: 'Описание',
    multiline: true,
    placeholder: 'Текст для подвала и страницы контактов',
  },
  {
    key: 'email',
    label: 'Email',
    placeholder: 'hello@example.com',
  },
  {
    key: 'phone',
    label: 'Телефон',
    placeholder: '+7 …',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    placeholder: '@username или https://t.me/...',
    hint: 'Можно указать @username, username или ссылку',
  },
  {
    key: 'vk',
    label: 'VK',
    placeholder: 'username или https://vk.com/...',
  },
  {
    key: 'github',
    label: 'GitHub',
    placeholder: 'username или https://github.com/...',
  },
]

export function AdminSettingsPage() {
  const { settings, loading, error, save } = useSiteSettings()
  const { showToast } = useToast()
  const [values, setValues] = useState<SiteSettingsFormValues>(
    toSiteSettingsFormValues(defaultSiteSettings),
  )
  const [submitting, setSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    setValues(toSiteSettingsFormValues(settings))
  }, [settings])

  const updateField = <K extends keyof SiteSettingsFormValues>(
    key: K,
    value: SiteSettingsFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    if (key === 'siteName') {
      setNameError(null)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!values.siteName.trim()) {
      setNameError('Укажите название сайта')
      return
    }

    setSubmitting(true)
    const result = await save(values)
    setSubmitting(false)

    if (!result.ok) {
      showToast(result.error ?? 'Не удалось сохранить настройки', 'error')
      return
    }

    showToast('Настройки сохранены', 'success')
  }

  const contactsMissing =
    !values.email.trim() &&
    !values.phone.trim() &&
    !values.telegram.trim() &&
    !values.vk.trim() &&
    !values.github.trim()

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          Настройки
        </h1>
        <p className="mt-1 text-sm text-muted">
          Данные сайта для Header, Footer, главной и страницы контактов. Пустые
          поля не отображаются.
        </p>
      </div>

      {contactsMissing ? (
        <div className="rounded-xl border border-accent/40 bg-soft px-4 py-3 text-sm text-ink">
          Сейчас контакты на сайте скрыты. Заполните хотя бы email или Telegram
          — и они появятся в футере и на странице «Контакты».
        </div>
      ) : null}

      <DataStatus
        loading={loading}
        error={error}
        loadingText="Загрузка настроек..."
      />

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="space-y-4 rounded-xl border border-border bg-surface p-4 md:p-6"
      >
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label
              className="text-xs font-medium text-muted"
              htmlFor={`settings-${field.key}`}
            >
              {field.label}
              {field.required ? ' *' : ''}
            </label>
            {field.multiline ? (
              <textarea
                id={`settings-${field.key}`}
                className={`${fieldClass} min-h-[6rem] resize-y`}
                value={values[field.key]}
                disabled={submitting || loading}
                placeholder={field.placeholder}
                onChange={(event) =>
                  updateField(field.key, event.target.value)
                }
              />
            ) : (
              <input
                id={`settings-${field.key}`}
                className={fieldClass}
                value={values[field.key]}
                disabled={submitting || loading}
                placeholder={field.placeholder}
                onChange={(event) =>
                  updateField(field.key, event.target.value)
                }
              />
            )}
            {field.key === 'siteName' && nameError ? (
              <p className="text-xs text-red-400">{nameError}</p>
            ) : null}
            {field.hint ? (
              <p className="text-xs text-muted">{field.hint}</p>
            ) : null}
          </div>
        ))}

        <AdminHeroImageField
          value={values.heroImage}
          disabled={submitting || loading}
          onChange={(url) => updateField('heroImage', url)}
        />

        <div className="pt-2">
          <Button type="submit" disabled={submitting || loading}>
            {submitting ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </div>
  )
}
