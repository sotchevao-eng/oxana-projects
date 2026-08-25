import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { useToast } from '../../components/ToastProvider'
import {
  CLIENT_PROJECT_STATUSES,
  CLIENT_PROJECT_TYPES,
} from '../../data/clientProjects'
import { createClientProject } from '../../services/clientProjectsService'
import { fetchClients } from '../../services/clientsService'
import type { Client, ClientProjectFormValues } from '../../types/clientProject'
import { emptyClientProjectForm } from '../../types/clientProject'

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-60'

export function AdminClientProjectNewPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [form, setForm] = useState<ClientProjectFormValues>(emptyClientProjectForm)
  const [clients, setClients] = useState<Client[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [clientsError, setClientsError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      const result = await fetchClients()
      if (!active) {
        return
      }
      setClients(result.data)
      setClientsError(result.error)
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const update =
    <K extends keyof ClientProjectFormValues>(key: K) =>
    (value: ClientProjectFormValues[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    }

  const updateClient =
    (key: keyof ClientProjectFormValues['client']) => (value: string) => {
      setForm((prev) => ({
        ...prev,
        client: { ...prev.client, [key]: value },
      }))
    }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) {
      return
    }
    setSubmitting(true)
    const result = await createClientProject(form)
    setSubmitting(false)

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Ошибка сохранения', 'error')
      return
    }

    showToast('Клиентский проект создан', 'success')
    navigate(`/admin/client-projects/${result.data.id}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">
          <Link to="/admin/client-projects" className="hover:text-ink">
            ← Клиентские проекты
          </Link>
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
          Новый клиентский проект
        </h1>
        <p className="mt-1 text-sm text-muted">
          Создайте клиента или выберите существующего. Ссылки на бриф и КП
          сгенерируются автоматически.
        </p>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="space-y-6 rounded-xl border border-border bg-surface p-4 sm:p-6"
      >
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-tight">Клиент</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.clientMode === 'new'
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-border text-muted hover:text-ink'
              }`}
              onClick={() => update('clientMode')('new')}
            >
              Новый клиент
            </button>
            <button
              type="button"
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.clientMode === 'existing'
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-border text-muted hover:text-ink'
              }`}
              onClick={() => update('clientMode')('existing')}
            >
              Существующий клиент
            </button>
          </div>

          {form.clientMode === 'existing' ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted" htmlFor="client-id">
                Клиент
              </label>
              <select
                id="client-id"
                className={fieldClass}
                value={form.clientId}
                onChange={(event) => update('clientId')(event.target.value)}
                required
              >
                <option value="">Выберите клиента</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {client.company ? ` · ${client.company}` : ''}
                  </option>
                ))}
              </select>
              {clientsError ? (
                <p className="text-xs text-red-500">{clientsError}</p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-medium text-muted" htmlFor="client-name">
                  Имя *
                </label>
                <input
                  id="client-name"
                  className={fieldClass}
                  value={form.client.name}
                  onChange={(event) => updateClient('name')(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted" htmlFor="client-company">
                  Компания
                </label>
                <input
                  id="client-company"
                  className={fieldClass}
                  value={form.client.company}
                  onChange={(event) => updateClient('company')(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted" htmlFor="client-email">
                  Email
                </label>
                <input
                  id="client-email"
                  type="email"
                  className={fieldClass}
                  value={form.client.email}
                  onChange={(event) => updateClient('email')(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted" htmlFor="client-phone">
                  Телефон
                </label>
                <input
                  id="client-phone"
                  className={fieldClass}
                  value={form.client.phone}
                  onChange={(event) => updateClient('phone')(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted" htmlFor="client-messenger">
                  Telegram / мессенджер
                </label>
                <input
                  id="client-messenger"
                  className={fieldClass}
                  value={form.client.messenger}
                  onChange={(event) =>
                    updateClient('messenger')(event.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-medium text-muted" htmlFor="client-notes">
                  Комментарий
                </label>
                <textarea
                  id="client-notes"
                  rows={3}
                  className={fieldClass}
                  value={form.client.notes}
                  onChange={(event) => updateClient('notes')(event.target.value)}
                />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="text-sm font-semibold tracking-tight">Проект</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-medium text-muted" htmlFor="project-title">
                Название проекта *
              </label>
              <input
                id="project-title"
                className={fieldClass}
                value={form.title}
                onChange={(event) => update('title')(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted" htmlFor="project-type">
                Тип проекта *
              </label>
              <select
                id="project-type"
                className={fieldClass}
                value={form.projectType}
                onChange={(event) => update('projectType')(event.target.value)}
              >
                {CLIENT_PROJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted" htmlFor="project-status">
                Статус
              </label>
              <select
                id="project-status"
                className={fieldClass}
                value={form.status}
                onChange={(event) => update('status')(event.target.value)}
              >
                {CLIENT_PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-medium text-muted" htmlFor="project-description">
                Краткое описание
              </label>
              <textarea
                id="project-description"
                rows={3}
                className={fieldClass}
                value={form.description}
                onChange={(event) => update('description')(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-medium text-muted" htmlFor="project-task">
                Задача
              </label>
              <textarea
                id="project-task"
                rows={3}
                className={fieldClass}
                value={form.task}
                onChange={(event) => update('task')(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted" htmlFor="project-budget">
                Бюджет
              </label>
              <input
                id="project-budget"
                className={fieldClass}
                value={form.budget}
                onChange={(event) => update('budget')(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted" htmlFor="project-deadline">
                Срок
              </label>
              <input
                id="project-deadline"
                className={fieldClass}
                value={form.deadline}
                onChange={(event) => update('deadline')(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-medium text-muted" htmlFor="project-notes">
                Комментарий
              </label>
              <textarea
                id="project-notes"
                rows={3}
                className={fieldClass}
                value={form.notes}
                onChange={(event) => update('notes')(event.target.value)}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border pt-5">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Сохранение...' : 'Создать проект'}
          </Button>
          <Button to="/admin/client-projects" variant="secondary">
            Отмена
          </Button>
        </div>
      </form>
    </div>
  )
}
