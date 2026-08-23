import { Button } from './Button'

interface ProjectsEmptyStateProps {
  onReset: () => void
  variant?: 'filtered' | 'empty'
}

export function ProjectsEmptyState({
  onReset,
  variant = 'filtered',
}: ProjectsEmptyStateProps) {
  if (variant === 'empty') {
    return (
      <div className="rounded-[2rem] border border-border bg-soft px-6 py-14 text-center md:px-10 md:py-20">
        <p className="font-display text-2xl font-medium tracking-tight text-ink md:text-3xl">
          Проектов пока нет
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted md:text-base">
          Опубликованные работы появятся в каталоге после добавления.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[2rem] border border-border bg-soft px-6 py-14 text-center md:px-10 md:py-20">
      <p className="font-display text-2xl font-medium tracking-tight text-ink md:text-3xl">
        По вашему запросу ничего не найдено
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted md:text-base">
        Попробуйте изменить фильтр, сортировку или поисковый запрос.
      </p>
      <Button
        type="button"
        variant="secondary"
        className="mt-8"
        onClick={onReset}
      >
        Сбросить фильтры
      </Button>
    </div>
  )
}
