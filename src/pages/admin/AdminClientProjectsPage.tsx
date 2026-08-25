import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { DataStatus } from '../../components/DataStatus'
import { useToast } from '../../components/ToastProvider'
import {
  CLIENT_PROJECT_STATUSES,
  CLIENT_PROJECT_TYPES,
} from '../../data/clientProjects'
import { formatAdminDate } from '../../services/adminService'
import {
  fetchClientProjects,
  matchesClientProjectFilters,
  matchesClientProjectSearch,
} from '../../services/clientProjectsService'
import type { ClientProjectListItem } from '../../types/clientProject'
import {
  getBriefPublicUrl,
  getProposalPublicUrl,
} from '../../utils/publicTokens'

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export function AdminClientProjectsPage() {
  const { showToast } = useToast()
  const [items, setItems] = useState<ClientProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const result = await fetchClientProjects()
      if (!active) {
        return
      }
      setItems(result.data)
      setError(result.error)
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesClientProjectFilters(item, statusFilter, typeFilter) &&
          matchesClientProjectSearch(item, search),
      ),
    [items, statusFilter, typeFilter, search],
  )

  const handleCopy = async (label: string, url: string) => {
    const ok = await copyText(url)
    showToast(
      ok ? `${label} скопирована` : 'Не удалось скопировать ссылку',
      ok ? 'success' : 'error',
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Клиентские проекты
          </h1>
          <p className="mt-1 text-sm text-muted">
            Клиенты, брифы и коммерческие предложения.
          </p>
        </div>
        <Button to="/admin/client-projects/new">+ Новый проект</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted" htmlFor="cp-search">
            Поиск
          </label>
          <input
            id="cp-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Клиент, компания, проект, email, телефон"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent/50"
          />
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-xs font-medium text-muted"
            htmlFor="cp-status"
          >
            Статус
          </label>
          <select
            id="cp-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent/50"
          >
            <option value="all">Все</option>
            {CLIENT_PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted" htmlFor="cp-type">
            Тип проекта
          </label>
          <select
            id="cp-type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent/50"
          >
            <option value="all">Все</option>
            {CLIENT_PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataStatus
        loading={loading}
        error={error}
        loadingText="Загрузка клиентских проектов..."
      />

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-soft/60 text-xs tracking-[0.06em] text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Клиент</th>
                <th className="px-4 py-3 font-medium">Проект</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Бриф</th>
                <th className="px-4 py-3 font-medium">КП</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    Пока нет клиентских проектов.
                  </td>
                </tr>
              ) : null}
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border/70 last:border-0 hover:bg-soft/40"
                >
                  <td className="px-4 py-3 align-top">
                    <Link
                      to={`/admin/clients/${item.client.id}`}
                      className="font-medium text-ink transition-colors hover:text-accent"
                    >
                      {item.client.name}
                    </Link>
                    {item.client.company ? (
                      <p className="mt-0.5 text-xs text-muted">
                        {item.client.company}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Link
                      to={`/admin/client-projects/${item.id}`}
                      className="font-medium text-ink transition-colors hover:text-accent"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top text-muted">
                    {item.projectType}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      className="text-xs font-medium text-accent hover:underline"
                      onClick={() =>
                        void handleCopy(
                          'Ссылка на бриф',
                          getBriefPublicUrl(item.briefToken),
                        )
                      }
                    >
                      Ссылка
                    </button>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      className="text-xs font-medium text-accent hover:underline"
                      onClick={() =>
                        void handleCopy(
                          'Ссылка на КП',
                          getProposalPublicUrl(item.proposalToken),
                        )
                      }
                    >
                      Ссылка
                    </button>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex rounded-full border border-border bg-soft px-2.5 py-1 text-xs text-ink">
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-muted">
                    {formatAdminDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Link
                      to={`/admin/client-projects/${item.id}`}
                      className="text-xs font-medium text-ink underline-offset-2 hover:underline"
                    >
                      Открыть
                    </Link>
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
