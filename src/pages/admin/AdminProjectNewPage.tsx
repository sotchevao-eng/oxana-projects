import { useNavigate } from 'react-router-dom'
import { AdminProjectForm } from '../../components/admin/AdminProjectForm'
import { useToast } from '../../components/ToastProvider'
import { createAdminProject } from '../../services/adminProjectsService'
import type { ProjectFormValues } from '../../types/projectForm'

export function AdminProjectNewPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const handleSubmit = async (values: ProjectFormValues) => {
    const result = await createAdminProject(values)
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Ошибка сохранения', 'error')
      return
    }

    showToast('Проект создан', 'success')
    navigate(`/admin/projects/${result.data.id}/edit`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          Новый проект
        </h1>
        <p className="mt-1 text-sm text-muted">
          Создайте карточку проекта для портфолио.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <AdminProjectForm submitLabel="Создать проект" onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
