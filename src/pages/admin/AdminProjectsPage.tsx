import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataStatus } from '../../components/DataStatus'
import { AdminTableSkeleton } from '../../components/Skeleton'
import { useToast } from '../../components/ToastProvider'
import { formatAdminDate } from '../../services/adminService'
import { fetchAdminProjects } from '../../services/adminService'
import {
  deleteAdminProject,
  duplicateAdminProject,
  hideAdminProject,
} from '../../services/adminProjectsService'
import { getProjectStatusLabel, formatProjectCategories } from '../../services/projectsService'
import type { Project } from '../../types'

export function AdminProjectsPage() {
  const { showToast } = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const load = async () => {
    setLoading(true)
    const result = await fetchAdminProjects()
    setProjects(result.data)
    setError(result.error)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const runAction = async (
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string,
  ) => {
    setBusyId(id)
    const result = await action()
    setBusyId(null)

    if (!result.ok) {
      showToast(result.error ?? 'Ошибка сохранения', 'error')
      return
    }

    showToast(successMessage, 'success')
    await load()
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return
    }

    const id = deleteTarget.id
    setBusyId(id)
    const result = await deleteAdminProject(id)
    setBusyId(null)
    setDeleteTarget(null)

    if (!result.ok) {
      showToast(result.error ?? 'Не удалось удалить проект', 'error')
      return
    }

    showToast('Проект удалён', 'success')
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Проекты
          </h1>
          <p className="mt-1 text-sm text-muted">
            Управление портфолио и статусами публикации.
          </p>
        </div>
        <Button to="/admin/projects/new">+ Новый проект</Button>
      </div>

      <DataStatus error={error} asWarning />

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-soft/60 text-xs tracking-[0.06em] text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-4 py-3 font-medium">Категория</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Год</th>
                <th className="px-4 py-3 font-medium">Избранное</th>
                <th className="px-4 py-3 font-medium">Дата создания</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <AdminTableSkeleton rows={6} />
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-muted">
                    Проектов пока нет
                  </td>
                </tr>
              ) : (
                projects.map((project) => (
                  <tr key={project.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{project.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{project.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatProjectCategories(project)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {getProjectStatusLabel(project.status)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">
                      {project.year}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {project.featured ? 'Да' : 'Нет'}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatAdminDate(project.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[12rem] flex-wrap gap-2">
                        <Link
                          to={`/projects/${project.slug}`}
                          className="text-xs text-muted hover:text-ink"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Просмотреть
                        </Link>
                        <Link
                          to={`/admin/projects/${project.id}/edit`}
                          className="text-xs text-muted hover:text-ink"
                        >
                          Редактировать
                        </Link>
                        <button
                          type="button"
                          disabled={busyId === project.id}
                          className="text-xs text-muted hover:text-ink disabled:opacity-50"
                          onClick={() =>
                            void runAction(
                              project.id,
                              () => duplicateAdminProject(project),
                              'Проект создан',
                            )
                          }
                        >
                          Дублировать
                        </button>
                        <button
                          type="button"
                          disabled={busyId === project.id}
                          className="text-xs text-muted hover:text-ink disabled:opacity-50"
                          onClick={() =>
                            void runAction(
                              project.id,
                              () => hideAdminProject(project.id),
                              'Проект скрыт',
                            )
                          }
                        >
                          Скрыть
                        </button>
                        <button
                          type="button"
                          disabled={busyId === project.id}
                          className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
                          onClick={() => setDeleteTarget(project)}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить проект?"
        description="Это действие нельзя отменить."
        cancelLabel="Отмена"
        confirmLabel="Удалить"
        confirming={busyId === deleteTarget?.id}
        onCancel={() => {
          if (busyId !== deleteTarget?.id) {
            setDeleteTarget(null)
          }
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  )
}
