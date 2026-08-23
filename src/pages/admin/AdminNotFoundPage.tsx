import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'

export function AdminNotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center gap-4 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Раздел не найден
      </h1>
      <p className="max-w-md text-sm text-muted">
        Такой страницы в админке нет. Вернитесь на дашборд или к списку
        проектов.
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Button to="/admin">На дашборд</Button>
        <Link
          to="/admin/projects"
          className="rounded-xl border border-border px-4 py-2.5 text-sm text-ink transition-colors hover:bg-soft"
        >
          К проектам
        </Link>
      </div>
    </div>
  )
}
