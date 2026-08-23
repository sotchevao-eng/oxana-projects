import { DataStatus } from '../components/DataStatus'
import { ProjectCard } from '../components/ProjectCard'
import { ProjectCatalogControls } from '../components/ProjectCatalogControls'
import { ProjectFilters } from '../components/ProjectFilters'
import { ProjectsEmptyState } from '../components/ProjectsEmptyState'
import { Section } from '../components/Section'
import { ProjectCardSkeleton } from '../components/Skeleton'
import { useProjectsCatalog } from '../hooks/useProjectsCatalog'
import { usePageMeta } from '../hooks/usePageMeta'

export function ProjectsPage() {
  usePageMeta({
    title: 'Проекты',
    description: 'Сайты, приложения и цифровые решения из портфолио.',
  })

  const {
    projects,
    loading,
    error,
    filterId,
    sortId,
    search,
    setFilterId,
    setSortId,
    setSearch,
    hasActiveFilters,
    resetFilters,
    totalCount,
  } = useProjectsCatalog()

  return (
    <div>
      <Section className="pb-8 pt-16 md:pb-10 md:pt-24">
        <div className="max-w-2xl space-y-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Портфолио
          </p>
          <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
            Проекты
          </h1>
          <p className="text-base leading-relaxed text-muted md:text-lg">
            Сайты, приложения и цифровые решения.
          </p>
        </div>
      </Section>

      <Section className="pb-8 md:pb-10">
        <div className="space-y-5 overflow-hidden rounded-[1.75rem] border border-border bg-surface p-4 sm:p-5 md:p-6">
          <ProjectFilters activeId={filterId} onChange={setFilterId} />
          <ProjectCatalogControls
            search={search}
            sortId={sortId}
            onSearchChange={setSearch}
            onSortChange={setSortId}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted">
              Найдено: <span className="text-ink">{totalCount}</span>
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-sm text-muted transition-colors duration-300 hover:text-ink"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section className="pb-20 md:pb-28">
        <DataStatus error={error} asWarning />

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <ProjectCardSkeleton key={index} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <ProjectsEmptyState
            onReset={resetFilters}
            variant={hasActiveFilters ? 'filtered' : 'empty'}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                variant="default"
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
