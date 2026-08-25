import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { DataStatus } from '../../components/DataStatus'
import { useToast } from '../../components/ToastProvider'
import { formatAdminDate } from '../../services/adminService'
import { fetchProjectsByClientId } from '../../services/clientProjectsService'
import { fetchClientById, updateClient } from '../../services/clientsService'
import type { Client, ClientFormValues, ClientProject } from '../../types/clientProject'

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-60'

export function AdminClientDetailPage() {
  const { id = '' } = useParams()
  const { showToast } = useToast()
  const [client, setClient] = useState<Client | null>(null)
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ClientFormValues>({
    name: '',
    company: '',
    email: '',
    phone: '',
    messenger: '',
    notes: '',
  })

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!id) {
        setError('Клиент не найден')
        setLoading(false)
        return
      }

      setLoading(true)
      const [clientResult, projectsResult] = await Promise.all([
        fetchClientById(id),
        fetchProjectsByClientId(id),
      ])

      if (!active) {
        return
      }

      if (!clientResult.data) {
        setClient(null)
        setError(clientResult.error ?? 'Клиент не найден')
        setLoading(false)
        return
      }

      setClient(clientResult.data)
      setForm({
        name: clientResult.data.name,
        company: clientResult.data.company ?? '',
        email: clientResult.data.email ?? '',
        phone: clientResult.data.phone ?? '',
        messenger: clientResult.data.messenger ?? '',
        notes: clientResult.data.notes ?? '',
      })
      setProjects(projectsResult.data)
      setError(clientResult.error ?? projectsResult.error)
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [id])

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    if (!client || saving) {
      return
    }

    setSaving(true)
    const result = await updateClient(client.id, form)
    setSaving(false)

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Ошибка сохранения', 'error')
      return
    }

    setClient(result.data)
    showToast('Клиент обновлён', 'success')
  }

  if (loading || error || !client) {
    return (
      <div className="space-y-5">
        <Link to="/admin/client-projects" className="text-sm text-muted hover:text-ink">
          ← Клиентские проекты
        </Link>
        <DataStatus
          loading={loading}
          error={error}
          loadingText="Загрузка клиента..."
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/admin/client-projects" className="text-sm text-muted hover:text-ink">
          ← Клиентские проекты
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
          {client.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Клиент с {formatAdminDate(client.createdAt)}
        </p>
      </div>

      <form
        onSubmit={(event) => void handleSave(event)}
        className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
      >
        <h2 className="text-sm font-semibold">Контакты</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-muted" htmlFor="client-name">
              Имя *
            </label>
            <input
              id="client-name"
              className={fieldClass}
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
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
              value={form.company}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, company: event.target.value }))
              }
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
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted" htmlFor="client-phone">
              Телефон
            </label>
            <input
              id="client-phone"
              className={fieldClass}
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted" htmlFor="client-messenger">
              Telegram / мессенджер
            </label>
            <input
              id="client-messenger"
              className={fieldClass}
              value={form.messenger}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, messenger: event.target.value }))
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
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
            />
          </div>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить клиента'}
        </Button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Проекты клиента</h2>
          <Button to="/admin/client-projects/new" variant="secondary">
            + Новый проект
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-soft/60 text-xs tracking-[0.06em] text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Проект</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    У клиента пока нет проектов.
                  </td>
                </tr>
              ) : null}
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-border/70 last:border-0 hover:bg-soft/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/client-projects/${project.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {project.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{project.projectType}</td>
                  <td className="px-4 py-3">{project.status}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatAdminDate(project.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
