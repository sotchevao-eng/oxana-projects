import { useParams } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Breadcrumb } from '../components/Breadcrumb'
import { Button } from '../components/Button'
import { CtaBanner } from '../components/CtaBanner'
import { DataStatus } from '../components/DataStatus'
import { ProjectCard } from '../components/ProjectCard'
import { ProjectGallery } from '../components/ProjectGallery'
import { SafeImage } from '../components/SafeImage'
import { Section } from '../components/Section'
import { ProjectCardSkeleton } from '../components/Skeleton'
import { useProjectDetail } from '../hooks/useProjectDetail'
import { usePageMeta } from '../hooks/usePageMeta'
import {
  formatProjectCategories,
  formatProjectDate,
  getPrimaryCategory,
  getProjectCaseSections,
  getProjectStatusLabel,
} from '../services/projectsService'
import { NotFoundPage } from './NotFoundPage'

export function ProjectDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { project, relatedProjects, loading, error, notFound } =
    useProjectDetail(slug)

  usePageMeta({
    title: project?.seoTitle || project?.title,
    description: project?.seoDescription || project?.shortDescription,
  })

  if (loading) {
    return (
      <Section className="space-y-8 pb-20 pt-16 md:pb-28 md:pt-24">
        <div className="max-w-3xl space-y-4">
          <div className="h-3 w-40 animate-pulse rounded bg-soft" />
          <div className="h-10 w-3/4 animate-pulse rounded-xl bg-soft" />
          <div className="h-4 w-full animate-pulse rounded bg-soft" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-soft" />
        </div>
        <div className="aspect-[16/10] w-full animate-pulse rounded-[2rem] bg-soft md:aspect-[21/9]" />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      </Section>
    )
  }

  if (notFound || !project) {
    return <NotFoundPage />
  }

  const eventDate = formatProjectDate(project.eventDate)
  const caseSections = getProjectCaseSections(project)
  const statusLabel = getProjectStatusLabel(project.status)

  const specs = [
    { label: 'Категории', value: formatProjectCategories(project) },
    { label: 'Год', value: String(project.year) },
    { label: 'Статус', value: statusLabel },
    {
      label: 'Адаптивность',
      value: project.responsive ? 'Полная' : 'Частичная',
    },
  ]

  return (
    <div>
      <Section className="pb-8 pt-10 md:pb-10 md:pt-16">
        <DataStatus error={error} />
        <Breadcrumb
          items={[
            { label: 'Главная', to: '/' },
            { label: 'Проекты', to: '/projects' },
            { label: project.title },
          ]}
        />

        <div className="max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>{formatProjectCategories(project)}</span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span>{eventDate ?? project.year}</span>
          </div>

          <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl md:text-5xl">
            {project.title}
          </h1>

          <p className="text-base leading-relaxed text-muted md:text-lg">
            {project.shortDescription}
          </p>

          {(project.demoUrl || project.githubUrl) && (
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              {project.demoUrl && (
                <Button href={project.demoUrl} external size="lg" className="gap-2">
                  Открыть демо
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              )}
              {project.githubUrl && (
                <Button
                  href={project.githubUrl}
                  external
                  variant="secondary"
                  size="lg"
                  className="gap-2"
                >
                  GitHub
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section className="pb-12 md:pb-16">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-soft">
          <div className="flex items-center justify-center px-3 py-3 sm:px-6 sm:py-6">
            <SafeImage
              src={project.coverImage ?? project.cardImage}
              alt={project.title}
              className="h-auto max-h-[min(70vh,560px)] w-auto max-w-full object-contain"
              loading="eager"
              fallbackTitle={project.title}
              fallbackCategory={getPrimaryCategory(project)}
              coverVariant="detail"
              coverClassName="aspect-[16/10] w-full md:aspect-[21/9]"
            />
          </div>
        </div>
      </Section>

      <Section className="pb-16 md:pb-24">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.85fr] lg:gap-14">
          <div className="space-y-10">
            <div className="space-y-3">
              <h2 className="font-display text-2xl font-medium tracking-tight md:text-3xl">
                О проекте
              </h2>
              <p className="text-base leading-relaxed text-muted md:text-lg">
                {project.description}
              </p>
            </div>

            <div className="space-y-8">
              <div className="space-y-3 border-t border-border pt-8">
                <h3 className="font-display text-xl font-medium tracking-tight">
                  Задача
                </h3>
                <p className="text-sm leading-relaxed text-muted md:text-base">
                  {caseSections.task}
                </p>
              </div>

              <div className="space-y-3 border-t border-border pt-8">
                <h3 className="font-display text-xl font-medium tracking-tight">
                  Решение
                </h3>
                <p className="text-sm leading-relaxed text-muted md:text-base">
                  {caseSections.solution}
                </p>
              </div>

              <div className="space-y-3 border-t border-border pt-8">
                <h3 className="font-display text-xl font-medium tracking-tight">
                  Результат
                </h3>
                <p className="text-sm leading-relaxed text-muted md:text-base">
                  {caseSections.result}
                </p>
              </div>
            </div>
          </div>

          <aside className="h-fit space-y-8">
            <div className="rounded-[1.75rem] border border-border bg-surface p-6 md:p-8">
              <h2 className="font-display text-lg font-medium tracking-tight">
                Характеристики
              </h2>
              <dl className="mt-6 space-y-4">
                {specs.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-b-0 last:pb-0"
                  >
                    <dt className="text-sm text-muted">{item.label}</dt>
                    <dd className="text-right text-sm text-ink">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {(project.demoUrl || project.githubUrl) && (
              <div className="flex flex-col gap-3">
                {project.demoUrl && (
                  <Button
                    href={project.demoUrl}
                    external
                    className="w-full gap-2"
                  >
                    Открыть демо
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                )}
                {project.githubUrl && (
                  <Button
                    href={project.githubUrl}
                    external
                    variant="secondary"
                    className="w-full gap-2"
                  >
                    GitHub
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </aside>
        </div>
      </Section>

      {project.technologies.length > 0 && (
        <Section className="pb-12 md:pb-16">
          <h2 className="mb-6 font-display text-2xl font-medium tracking-tight">
            Технологии
          </h2>
          <div className="flex flex-wrap gap-2">
            {project.technologies.map((item) => (
              <span
                key={item}
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink transition-colors duration-300 hover:border-accent hover:bg-soft"
              >
                {item}
              </span>
            ))}
          </div>
        </Section>
      )}

      <ProjectGallery images={project.gallery} title={project.title} />

      <Section className="pb-16 md:pb-24">
        <CtaBanner
          title="Нужен похожий проект?"
          description="Расскажите о вашей задаче — можно создать решение под ваши процессы."
        />
      </Section>

      {relatedProjects.length > 0 && (
        <Section className="pb-20 md:pb-28">
          <div className="mb-8 space-y-3 md:mb-10">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Ещё из портфолио
            </p>
            <h2 className="font-display text-3xl font-medium tracking-tight">
              Другие проекты
            </h2>
          </div>
          <div className="grid gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {relatedProjects.map((item) => (
              <ProjectCard key={item.id} project={item} variant="default" />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
