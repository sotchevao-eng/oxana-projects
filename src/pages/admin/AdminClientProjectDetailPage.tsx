import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { DataStatus } from '../../components/DataStatus'
import { useToast } from '../../components/ToastProvider'
import {
  CLIENT_PROJECT_STATUSES,
  CLIENT_PROJECT_TYPES,
} from '../../data/clientProjects'
import { formatAdminDate } from '../../services/adminService'
import {
  fetchClientProjectById,
  updateClientProject,
} from '../../services/clientProjectsService'
import type { ClientProject } from '../../types/clientProject'
import {
  getBriefPublicUrl,
  getProposalPublicUrl,
} from '../../utils/publicTokens'

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

export function AdminClientProjectDetailPage() {
  const { id = '' } = useParams()
  const { showToast } = useToast()
  const [project, setProject] = useState<ClientProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    projectType: 'Сайт',
    description: '',
    task: '',
    notes: '',
    budget: '',
    deadline: '',
    status: 'Новый',
  })

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!id) {
        setError('Проект не найден')
        setLoading(false)
        return
      }

      setLoading(true)
      const result = await fetchClientProjectById(id)
      if (!active) {
        return
      }

      if (!result.data) {
        setProject(null)
        setError(result.error ?? 'Проект не найден')
        setLoading(false)
        return
      }

      setProject(result.data)
      setForm({
        title: result.data.title,
        projectType: result.data.projectType,
        description: result.data.description ?? '',
        task: result.data.task ?? '',
        notes: result.data.notes ?? '',
        budget: result.data.budget ?? '',
        deadline: result.data.deadline ?? '',
        status: result.data.status,
      })
      setError(result.error)
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [id])

  const handleCopy = async (label: string, url: string) => {
    const ok = await copyText(url)
    showToast(
      ok ? `${label} скопирована` : 'Не удалось скопировать ссылку',
      ok ? 'success' : 'error',
    )
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    if (!project || saving) {
      return
    }

    setSaving(true)
    const result = await updateClientProject(project.id, form)
    setSaving(false)

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Ошибка сохранения', 'error')
      return
    }

    setProject(result.data)
    showToast('Проект обновлён', 'success')
  }

  if (loading || error || !project) {
    return (
      <div className="space-y-5">
        <Link to="/admin/client-projects" className="text-sm text-muted hover:text-ink">
          ← Клиентские проекты
        </Link>
        <DataStatus
          loading={loading}
          error={error}
          loadingText="Загрузка проекта..."
        />
      </div>
    )
  }

  const briefUrl = getBriefPublicUrl(project.briefToken)
  const proposalUrl = getProposalPublicUrl(project.proposalToken)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/admin/client-projects" className="text-sm text-muted hover:text-ink">
            ← Клиентские проекты
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
            {project.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Создан {formatAdminDate(project.createdAt)}
            {project.client ? (
              <>
                {' · '}
                <Link
                  to={`/admin/clients/${project.client.id}`}
                  className="text-accent hover:underline"
                >
                  {project.client.name}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <span className="inline-flex self-start rounded-full border border-border bg-soft px-3 py-1.5 text-xs font-medium">
          {project.status}
        </span>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.06em] text-muted uppercase">
            Бриф
          </p>
          <p className="break-all text-xs text-muted">{briefUrl}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="md"
              variant="secondary"
              onClick={() => void handleCopy('Ссылка на бриф', briefUrl)}
            >
              Скопировать ссылку на бриф
            </Button>
            <Button href={briefUrl} variant="ghost" external>
              Открыть бриф
            </Button>
          </div>
          <p className="text-xs text-muted">
            Публичная страница брифа появится на этапе 2.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.06em] text-muted uppercase">
            Коммерческое предложение
          </p>
          <p className="break-all text-xs text-muted">{proposalUrl}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="md"
              variant="secondary"
              onClick={() => void handleCopy('Ссылка на КП', proposalUrl)}
            >
              Скопировать ссылку на КП
            </Button>
            <Button href={proposalUrl} variant="ghost" external>
              Открыть КП
            </Button>
          </div>
          <p className="text-xs text-muted">
            Публичный лендинг КП появится на этапе 3.
          </p>
        </div>
      </div>

      {project.client ? (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Клиент</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Имя</dt>
              <dd>{project.client.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Компания</dt>
              <dd>{project.client.company || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Email</dt>
              <dd>{project.client.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Телефон</dt>
              <dd>{project.client.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Мессенджер</dt>
              <dd>{project.client.messenger || '—'}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <form
        onSubmit={(event) => void handleSave(event)}
        className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
      >
        <h2 className="text-sm font-semibold">Параметры проекта</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-muted" htmlFor="edit-title">
              Название
            </label>
            <input
              id="edit-title"
              className={fieldClass}
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted" htmlFor="edit-type">
              Тип
            </label>
            <select
              id="edit-type"
              className={fieldClass}
              value={form.projectType}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, projectType: event.target.value }))
              }
            >
              {CLIENT_PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted" htmlFor="edit-status">
              Статус
            </label>
            <select
              id="edit-status"
              className={fieldClass}
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              {CLIENT_PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-muted" htmlFor="edit-description">
              Описание
            </label>
            <textarea
              id="edit-description"
              rows={3}
              className={fieldClass}
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-muted" htmlFor="edit-task">
              Задача
            </label>
            <textarea
              id="edit-task"
              rows={3}
              className={fieldClass}
              value={form.task}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, task: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted" htmlFor="edit-budget">
              Бюджет
            </label>
            <input
              id="edit-budget"
              className={fieldClass}
              value={form.budget}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, budget: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted" htmlFor="edit-deadline">
              Срок
            </label>
            <input
              id="edit-deadline"
              className={fieldClass}
              value={form.deadline}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, deadline: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-muted" htmlFor="edit-notes">
              Комментарий
            </label>
            <textarea
              id="edit-notes"
              rows={3}
              className={fieldClass}
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
            />
          </div>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </Button>
      </form>
    </div>
  )
}
