import { useEffect, useMemo, useState } from 'react'
import { Button } from '../Button'
import { useToast } from '../ToastProvider'
import type { ClientProject } from '../../types/clientProject'
import type { BriefAnswersMap, BriefField, BriefSubmission } from '../../types/brief'
import {
  answersToMap,
  fetchBriefFields,
  fetchLatestBriefSubmission,
} from '../../services/briefService'
import { formatAdminDate } from '../../services/adminService'
import {
  buildBriefVariables,
  formatBriefAnswersForCopy,
} from '../../utils/briefVariables'
import { getBriefPublicUrl } from '../../utils/publicTokens'

function displayValue(value: BriefAnswersMap[string]): string {
  if (value === null || value === undefined) {
    return '—'
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '—'
  }
  if (typeof value === 'boolean') {
    return value ? 'Да' : 'Нет'
  }
  const text = String(value).trim()
  return text || '—'
}

interface AdminBriefAnswersProps {
  project: ClientProject
}

export function AdminBriefAnswers({ project }: AdminBriefAnswersProps) {
  const { showToast } = useToast()
  const [fields, setFields] = useState<BriefField[]>([])
  const [submission, setSubmission] = useState<BriefSubmission | null>(null)
  const [answers, setAnswers] = useState<BriefAnswersMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'cards' | 'table'>('cards')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const [fieldsResult, submissionResult] = await Promise.all([
        fetchBriefFields(project.id),
        fetchLatestBriefSubmission(project.id),
      ])
      if (!active) {
        return
      }
      setFields(fieldsResult.data)
      setSubmission(submissionResult.data)
      setAnswers(answersToMap(submissionResult.answers))
      setError(fieldsResult.error ?? submissionResult.error)
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [project.id])

  const variables = useMemo(
    () =>
      buildBriefVariables(answers, {
        client_name: project.client?.name,
        company_name:
          typeof answers.company_name === 'string'
            ? answers.company_name
            : project.client?.company,
        project_title: project.title,
        project_type: project.projectType,
        current_date: new Date().toLocaleDateString('ru-RU'),
      }),
    [answers, project],
  )

  const handleCopy = async () => {
    const text = formatBriefAnswersForCopy(fields, answers)
    try {
      await navigator.clipboard.writeText(text)
      showToast('Ответы скопированы', 'success')
    } catch {
      showToast('Не удалось скопировать', 'error')
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Загрузка ответов...</p>
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            Статус:{' '}
            <span className="font-medium text-ink">
              {submission?.status === 'submitted'
                ? 'Бриф отправлен'
                : submission?.status === 'draft'
                  ? 'Черновик'
                  : 'Ответов пока нет'}
            </span>
          </p>
          {submission?.submittedAt ? (
            <p className="mt-1 text-xs text-muted">
              Отправлено: {formatAdminDate(submission.submittedAt)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void handleCopy()}>
            Скопировать все ответы
          </Button>
          <Button href={getBriefPublicUrl(project.briefToken)} variant="ghost" external>
            Открыть публичный бриф
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            view === 'cards'
              ? 'border-accent bg-accent/10 text-ink'
              : 'border-border text-muted'
          }`}
          onClick={() => setView('cards')}
        >
          Карточки
        </button>
        <button
          type="button"
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            view === 'table'
              ? 'border-accent bg-accent/10 text-ink'
              : 'border-border text-muted'
          }`}
          onClick={() => setView('table')}
        >
          Таблица
        </button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          Сначала добавьте вопросы во вкладке «Бриф».
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-3">
          {fields.map((field) => (
            <article
              key={field.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <p className="text-sm font-medium text-ink">
                {field.label}
                {field.required ? <span className="text-accent"> *</span> : null}
              </p>
              <p className="mt-1 text-xs text-muted">{field.fieldKey}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink">
                {displayValue(answers[field.fieldKey])}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-soft/60 text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Вопрос</th>
                <th className="px-4 py-3 font-medium">Ключ</th>
                <th className="px-4 py-3 font-medium">Ответ</th>
                <th className="px-4 py-3 font-medium">Обяз.</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">{field.label}</td>
                  <td className="px-4 py-3 text-muted">{field.fieldKey}</td>
                  <td className="px-4 py-3 whitespace-pre-wrap">
                    {displayValue(answers[field.fieldKey])}
                  </td>
                  <td className="px-4 py-3">{field.required ? 'Да' : 'Нет'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded-xl border border-border bg-soft/40 p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Переменные для КП (превью)
        </summary>
        <pre className="mt-3 overflow-x-auto text-xs text-muted">
          {JSON.stringify(variables, null, 2)}
        </pre>
      </details>
    </div>
  )
}
