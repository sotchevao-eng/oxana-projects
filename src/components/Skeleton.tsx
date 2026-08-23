interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-soft ${className}`}
      aria-hidden="true"
    />
  )
}

export function ProjectCardSkeleton({
  variant = 'default',
}: {
  variant?: 'default' | 'large'
}) {
  const media = variant === 'large' ? 'h-48 sm:h-56' : 'h-40 sm:h-48'

  return (
    <div
      className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-surface"
      role="status"
      aria-label="Загрузка проекта"
    >
      <Skeleton className={`w-full rounded-none ${media}`} />
      <div className="space-y-3 px-5 py-5 sm:px-6 sm:py-6">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

export function AdminTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Загрузка">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  )
}
