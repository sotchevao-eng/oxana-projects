interface DataStatusProps {
  loading?: boolean
  error?: string | null
  loadingText?: string
  /** Если true — ошибка показывается как предупреждение при наличии локальных данных */
  asWarning?: boolean
}

export function DataStatus({
  loading = false,
  error = null,
  loadingText = 'Загрузка...',
  asWarning = false,
}: DataStatusProps) {
  if (!loading && !error) {
    return null
  }

  return (
    <div className="mb-6 space-y-2">
      {loading && (
        <p className="text-sm text-muted" role="status">
          {loadingText}
        </p>
      )}
      {error && (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            asWarning
              ? 'border-border bg-soft text-muted'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
