import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminProjectForm } from '../../components/admin/AdminProjectForm'
import { DataStatus } from '../../components/DataStatus'
import { useToast } from '../../components/ToastProvider'
import {
  fetchAdminProjectById,
  updateAdminProject,
} from '../../services/adminProjectsService'
import {
  emptyProjectForm,
  projectToFormValues,
  type ProjectFormValues,
} from '../../types/projectForm'

export function AdminProjectEditPage() {
  const { id } = useParams<{ id: string }>()
  const { showToast } = useToast()
  const [values, setValues] = useState<ProjectFormValues>(emptyProjectForm)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!id) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setLoading(true)
      const result = await fetchAdminProjectById(id)
      if (!active) {
        return
      }

      if (!result.data) {
        setNotFound(true)
        setError(result.error)
        setLoading(false)
        return
      }

      setValues(projectToFormValues(result.data))
      setError(result.error)
      setNotFound(false)
      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [id])

  const handleSubmit = async (formValues: ProjectFormValues) => {
    if (!id) {
      return
    }

    const result = await updateAdminProject(id, formValues)
    if (!result.ok) {
      showToast(result.error ?? 'Ошибка сохранения', 'error')
      return
    }

    showToast('Изменения сохранены', 'success')
    if (result.data) {
      setValues(projectToFormValues(result.data))
    }
  }

  if (loading) {
    return <DataStatus loading loadingText="Загрузка проекта..." />
  }

  if (notFound) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Проект не найден</h1>
        <Link to="/admin/projects" className="text-sm text-muted hover:text-ink">
          ← К списку проектов
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          Редактирование проекта
        </h1>
        <p className="mt-1 text-sm text-muted">{values.title}</p>
      </div>

      <DataStatus error={error} />

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <AdminProjectForm
          initialValues={values}
          projectId={id}
          submitLabel="Сохранить изменения"
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  )
}
