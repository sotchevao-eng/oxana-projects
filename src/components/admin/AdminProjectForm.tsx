import { useEffect, useId, useState, type FormEvent } from 'react'
import { Button } from '../Button'
import type { ProjectFormErrors, ProjectFormValues } from '../../types/projectForm'
import {
  emptyProjectForm,
  projectCategoryOptions,
  projectStatusOptions,
  slugifyTitle,
  validateProjectForm,
} from '../../types/projectForm'
import { AdminGalleryUploadField } from './AdminGalleryUploadField'
import { AdminImageUploadField } from './AdminImageUploadField'

interface AdminProjectFormProps {
  initialValues?: ProjectFormValues
  projectId?: string
  submitLabel: string
  onSubmit: (values: ProjectFormValues) => Promise<void>
}

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-ink/30 disabled:opacity-60'

export function AdminProjectForm({
  initialValues = emptyProjectForm,
  projectId,
  submitLabel,
  onSubmit,
}: AdminProjectFormProps) {
  const generatedKey = useId().replace(/:/g, '')
  const [values, setValues] = useState<ProjectFormValues>(initialValues)
  const [errors, setErrors] = useState<ProjectFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues.slug))
  const [uploadKey] = useState(() => projectId ?? `temp-${generatedKey}`)

  useEffect(() => {
    setValues(initialValues)
    setSlugTouched(Boolean(initialValues.slug))
  }, [initialValues])

  const projectKey = projectId ?? uploadKey

  const updateField = <K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) {
      return
    }

    const nextErrors = validateProjectForm(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(values)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="title">
            Название *
          </label>
          <input
            id="title"
            className={fieldClass}
            value={values.title}
            disabled={submitting}
            onChange={(event) => {
              const title = event.target.value
              updateField('title', title)
              if (!slugTouched) {
                updateField('slug', slugifyTitle(title))
              }
            }}
          />
          {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="slug">
            Slug *
          </label>
          <input
            id="slug"
            className={fieldClass}
            value={values.slug}
            disabled={submitting}
            onChange={(event) => {
              setSlugTouched(true)
              updateField('slug', event.target.value)
            }}
          />
          {errors.slug && <p className="text-xs text-red-500">{errors.slug}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="year">
            Год *
          </label>
          <input
            id="year"
            className={fieldClass}
            value={values.year}
            disabled={submitting}
            onChange={(event) => updateField('year', event.target.value)}
          />
          {errors.year && <p className="text-xs text-red-500">{errors.year}</p>}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="shortDescription">
            Краткое описание *
          </label>
          <textarea
            id="shortDescription"
            rows={2}
            className={fieldClass}
            value={values.shortDescription}
            disabled={submitting}
            onChange={(event) => updateField('shortDescription', event.target.value)}
          />
          {errors.shortDescription && (
            <p className="text-xs text-red-500">{errors.shortDescription}</p>
          )}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="description">
            Полное описание *
          </label>
          <textarea
            id="description"
            rows={5}
            className={fieldClass}
            value={values.description}
            disabled={submitting}
            onChange={(event) => updateField('description', event.target.value)}
          />
          {errors.description && (
            <p className="text-xs text-red-500">{errors.description}</p>
          )}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="task">
            Задача
          </label>
          <textarea
            id="task"
            rows={3}
            className={fieldClass}
            value={values.task}
            disabled={submitting}
            placeholder="Какую проблему решал проект"
            onChange={(event) => updateField('task', event.target.value)}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="solution">
            Решение
          </label>
          <textarea
            id="solution"
            rows={3}
            className={fieldClass}
            value={values.solution}
            disabled={submitting}
            placeholder="Как реализовали"
            onChange={(event) => updateField('solution', event.target.value)}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="result">
            Результат
          </label>
          <textarea
            id="result"
            rows={3}
            className={fieldClass}
            value={values.result}
            disabled={submitting}
            placeholder="Что получилось в итоге"
            onChange={(event) => updateField('result', event.target.value)}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <p className="text-xs font-medium text-muted">Категории</p>
          <p className="text-[11px] text-muted/80">
            Можно выбрать несколько — проект попадёт во все выбранные фильтры
          </p>
          <div className="flex flex-wrap gap-2">
            {projectCategoryOptions.map((option) => {
              const checked = values.categories.includes(option)
              return (
                <label
                  key={option}
                  className={`chip-neon cursor-pointer ${
                    checked ? 'chip-neon-active' : ''
                  } ${submitting ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={submitting}
                    onChange={() => {
                      const next = checked
                        ? values.categories.filter((item) => item !== option)
                        : [...values.categories, option]
                      updateField('categories', next)
                    }}
                  />
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] leading-none ${
                      checked
                        ? 'border-accent bg-brand-gradient text-white'
                        : 'border-accent/50 bg-surface text-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    {checked ? '✓' : ''}
                  </span>
                  {option}
                </label>
              )
            })}
          </div>
          {errors.categories ? (
            <p className="text-xs text-red-500">{errors.categories}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="eventDate">
            Дата
          </label>
          <input
            id="eventDate"
            type="date"
            className={fieldClass}
            value={values.eventDate}
            disabled={submitting}
            onChange={(event) => updateField('eventDate', event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="status">
            Статус
          </label>
          <select
            id="status"
            className={fieldClass}
            value={values.status}
            disabled={submitting}
            onChange={(event) =>
              updateField('status', event.target.value as ProjectFormValues['status'])
            }
          >
            {projectStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <AdminImageUploadField
          label="Изображение"
          hint="Показывается в карточке списка и на странице проекта"
          kind="cover"
          value={values.coverImage}
          projectKey={projectKey}
          disabled={submitting}
          className="md:col-span-2"
          onChange={(url) => updateField('coverImage', url)}
        />

        <AdminGalleryUploadField
          images={values.galleryImages}
          projectKey={projectKey}
          disabled={submitting}
          onChange={(images) => updateField('galleryImages', images)}
        />

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="demoUrl">
            Demo URL
          </label>
          <input
            id="demoUrl"
            className={fieldClass}
            value={values.demoUrl}
            disabled={submitting}
            onChange={(event) => updateField('demoUrl', event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="websiteUrl">
            Website URL
          </label>
          <input
            id="websiteUrl"
            className={fieldClass}
            value={values.websiteUrl}
            disabled={submitting}
            onChange={(event) => updateField('websiteUrl', event.target.value)}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="githubUrl">
            GitHub URL
          </label>
          <input
            id="githubUrl"
            className={fieldClass}
            value={values.githubUrl}
            disabled={submitting}
            onChange={(event) => updateField('githubUrl', event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="technologies">
            Технологии
          </label>
          <input
            id="technologies"
            className={fieldClass}
            placeholder="React, TypeScript"
            value={values.technologies}
            disabled={submitting}
            onChange={(event) => updateField('technologies', event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="tags">
            Теги
          </label>
          <input
            id="tags"
            className={fieldClass}
            placeholder="ЖКХ, CRM"
            value={values.tags}
            disabled={submitting}
            onChange={(event) => updateField('tags', event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="sortOrder">
            Порядок отображения
          </label>
          <input
            id="sortOrder"
            className={fieldClass}
            value={values.sortOrder}
            disabled={submitting}
            onChange={(event) => updateField('sortOrder', event.target.value)}
          />
        </div>

        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={values.featured}
              disabled={submitting}
              onChange={(event) => updateField('featured', event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Избранный проект
          </label>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="seoTitle">
            SEO title
          </label>
          <input
            id="seoTitle"
            className={fieldClass}
            value={values.seoTitle}
            disabled={submitting}
            onChange={(event) => updateField('seoTitle', event.target.value)}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-muted" htmlFor="seoDescription">
            SEO description
          </label>
          <textarea
            id="seoDescription"
            rows={3}
            className={fieldClass}
            value={values.seoDescription}
            disabled={submitting}
            onChange={(event) => updateField('seoDescription', event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Сохранение...' : submitLabel}
        </Button>
        <Button to="/admin/projects" variant="secondary" disabled={submitting}>
          Отмена
        </Button>
      </div>
    </form>
  )
}
