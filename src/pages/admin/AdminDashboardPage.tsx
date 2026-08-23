import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataStatus } from '../../components/DataStatus'
import {
  fetchDashboardData,
  formatAdminDate,
  getContactStatusLabel,
  type DashboardData,
} from '../../services/adminService'
import { formatProjectCategories, getProjectStatusLabel } from '../../services/projectsService'

const emptyStats: DashboardData = {
  stats: {
    totalProjects: 0,
    publishedProjects: 0,
    draftProjects: 0,
    featuredProjects: 0,
    totalContacts: 0,
    newContacts: 0,
  },
  recentProjects: [],
  recentContacts: [],
  error: null,
}

export function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyStats)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const result = await fetchDashboardData()
      if (!active) {
        return
      }
      setData(result)
      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const cards = [
    { label: 'Всего проектов', value: data.stats.totalProjects },
    { label: 'Опубликовано', value: data.stats.publishedProjects },
    { label: 'Черновиков', value: data.stats.draftProjects },
    { label: 'Избранных', value: data.stats.featuredProjects },
    { label: 'Всего заявок', value: data.stats.totalContacts },
    { label: 'Новых заявок', value: data.stats.newContacts },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-ink md:text-2xl">
          Dashboard
        </h1>
        <p className="text-sm text-muted">
          Обзор проектов и входящих заявок.
        </p>
      </div>

      <DataStatus
        loading={loading}
        error={data.error}
        loadingText="Загрузка панели..."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-surface px-4 py-4"
          >
            <p className="text-[11px] tracking-[0.08em] text-muted uppercase">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
              {loading ? '—' : card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Последние проекты</h2>
            <Link
              to="/admin/projects"
              className="text-xs text-muted transition-colors hover:text-ink"
            >
              Все
            </Link>
          </div>

          <div className="divide-y divide-border">
            {!loading && data.recentProjects.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Пока нет проектов</p>
            ) : (
              data.recentProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {project.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatProjectCategories(project)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted">
                      {getProjectStatusLabel(project.status)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {formatAdminDate(project.updatedAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Последние заявки</h2>
            <Link
              to="/admin/contacts"
              className="text-xs text-muted transition-colors hover:text-ink"
            >
              Все
            </Link>
          </div>

          <div className="divide-y divide-border">
            {!loading && data.recentContacts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Пока нет заявок</p>
            ) : (
              data.recentContacts.map((contact) => (
                <Link
                  key={contact.id}
                  to={`/admin/contacts/${contact.id}`}
                  className={`flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-soft/50 ${
                    contact.status === 'new' || contact.status === 'local'
                      ? 'bg-accent/20'
                      : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {contact.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {contact.projectType || 'Тип не указан'}
                      {contact.email ? ` · ${contact.email}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted">
                      {getContactStatusLabel(contact.status)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {formatAdminDate(contact.createdAt)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
