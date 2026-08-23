import { Button } from '../components/Button'
import { CtaBanner } from '../components/CtaBanner'
import { DataStatus } from '../components/DataStatus'
import { HeroVisual } from '../components/HeroVisual'
import { ProjectCard } from '../components/ProjectCard'
import { Reveal } from '../components/Reveal'
import { Section } from '../components/Section'
import { ServiceCard } from '../components/ServiceCard'
import { ProjectCardSkeleton } from '../components/Skeleton'
import { services } from '../data/services'
import { hasText } from '../data/siteSettings'
import { useFeaturedProjects } from '../hooks/useFeaturedProjects'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSiteSettings } from '../hooks/useSiteSettings'

export function HomePage() {
  const { settings } = useSiteSettings()
  const { projects: featuredProjects, loading, error } = useFeaturedProjects(6)
  const hasHeroImage = hasText(settings.heroImage)

  usePageMeta({
    title: settings.siteName,
    description: settings.description || settings.subtitle,
  })

  return (
    <div>
      <Section className="relative overflow-hidden pb-16 pt-12 md:pb-24 md:pt-20">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
        >
          <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="absolute right-0 top-16 h-80 w-80 rounded-full bg-brand-violet/25 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-brand-blue/20 blur-3xl" />
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <Reveal className="space-y-7">
            <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-brand-gradient">
              {settings.siteName}
            </p>
            <h1 className="max-w-xl font-display text-3xl font-medium leading-[1.2] tracking-tight text-ink sm:text-4xl md:text-5xl">
              Создаю сайты и приложения под реальные задачи
            </h1>
            {hasText(settings.subtitle) ? (
              <p className="max-w-lg text-base leading-relaxed text-muted md:text-lg">
                {settings.subtitle.trim()}
              </p>
            ) : (
              <p className="max-w-lg text-base leading-relaxed text-muted md:text-lg">
                От идеи и структуры до готового цифрового продукта.
              </p>
            )}
            {hasText(settings.description) ? (
              <p className="max-w-lg text-sm leading-relaxed text-muted md:text-base">
                {settings.description.trim()}
              </p>
            ) : (
              <p className="max-w-lg text-sm leading-relaxed text-muted md:text-base">
                Сайты, web-приложения, автоматизация и digital-решения.
              </p>
            )}
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <Button to="/projects" size="lg">
                Смотреть проекты
              </Button>
              <Button to="/contacts" variant="secondary" size="lg">
                Обсудить проект
              </Button>
            </div>
          </Reveal>

          <Reveal className="hidden lg:block" delayMs={120}>
            {hasHeroImage ? (
              <div className="relative overflow-hidden rounded-[2rem] border-brand-gradient glow-brand">
                <img
                  src={settings.heroImage}
                  alt={settings.siteName}
                  className="aspect-[4/5] w-full object-cover md:aspect-[5/6]"
                  loading="eager"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/50 via-transparent to-accent/10" />
              </div>
            ) : (
              <HeroVisual />
            )}
          </Reveal>
        </div>
      </Section>

      <Section className="py-16 md:py-24">
        <Reveal className="mb-10 flex flex-col justify-between gap-4 md:mb-14 md:flex-row md:items-end">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Портфолио
            </p>
            <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
              Избранные проекты
            </h2>
          </div>
          <Button to="/projects" variant="secondary">
            Все проекты
          </Button>
        </Reveal>

        <DataStatus error={error} asWarning />

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <ProjectCardSkeleton key={index} variant="large" />
            ))}
          </div>
        ) : featuredProjects.length === 0 ? (
          <div className="rounded-[2rem] border border-border bg-soft px-6 py-14 text-center">
            <p className="font-display text-2xl font-medium tracking-tight text-ink">
              Избранных проектов пока нет
            </p>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Опубликованные проекты появятся здесь после добавления в админке.
            </p>
            <Button to="/projects" variant="secondary" className="mt-8">
              Смотреть все проекты
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {featuredProjects.map((project, index) => (
              <Reveal key={project.id} delayMs={index * 80}>
                <ProjectCard project={project} variant="large" />
              </Reveal>
            ))}
          </div>
        )}
      </Section>

      <Section className="py-16 md:py-24">
        <Reveal className="mb-10 max-w-2xl space-y-3 md:mb-14">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Направления
          </p>
          <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
            Что я создаю
          </h2>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <Reveal key={service.title} delayMs={index * 70}>
              <ServiceCard
                title={service.title}
                description={service.description}
                icon={service.icon}
              />
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pb-20 md:pb-28">
        <CtaBanner
          title="Есть идея проекта?"
          description="Расскажите о задаче — подберём подходящее цифровое решение."
        />
      </Section>
    </div>
  )
}
