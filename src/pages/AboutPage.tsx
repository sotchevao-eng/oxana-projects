import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { Reveal } from '../components/Reveal'
import { Section } from '../components/Section'
import {
  aboutApproach,
  aboutDirections,
  aboutInterestsText,
  aboutProcess,
} from '../data/about'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSiteSettings } from '../hooks/useSiteSettings'

export function AboutPage() {
  const { settings } = useSiteSettings()
  usePageMeta({
    title: 'Обо мне',
    description:
      'Создаю цифровые продукты под реальные задачи: сайты, приложения, боты, ИИ-инструменты и автоматизации.',
  })

  return (
    <div>
      <Section className="relative overflow-hidden pb-16 pt-14 md:pb-24 md:pt-20">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
        >
          <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="absolute right-0 top-20 h-80 w-80 rounded-full bg-brand-violet/25 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-brand-blue/20 blur-3xl" />
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <Reveal className="space-y-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              {settings.siteName}
            </p>
            <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
              Обо мне
            </h1>
            <p className="max-w-xl font-display text-xl font-medium leading-snug tracking-tight text-ink sm:text-2xl md:text-[1.65rem]">
              Создаю цифровые продукты под реальные задачи
            </p>
            <p className="max-w-lg text-base leading-relaxed text-muted md:text-lg">
              Сайты, приложения, боты, ИИ-инструменты и автоматизации — от идеи
              и прототипа до рабочего проекта.
            </p>
            <p className="max-w-lg text-sm leading-relaxed text-muted md:text-base">
              Стараюсь делать решения понятными, удобными и полезными, а не
              сложными ради самой технологии.
            </p>
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <Button to="/projects" size="lg">
                Смотреть проекты
              </Button>
              <Button to="/contacts" variant="secondary" size="lg">
                Обсудить проект
              </Button>
            </div>
          </Reveal>

          <Reveal className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none" delayMs={120}>
            <div className="overflow-hidden rounded-[2rem] border border-accent/35 bg-soft glow-brand">
              <img
                src="/about/hero.png"
                alt="OXANA PROJECTS — сайты, приложения, боты, автоматизация и ИИ-инструменты"
                className="h-auto w-full object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="pb-16 md:pb-24">
        <Reveal className="mb-10 max-w-2xl space-y-3 md:mb-14">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Принципы
          </p>
          <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
            Мой подход
          </h2>
          <p className="text-base leading-relaxed text-muted">
            Проект должен быть понятным, полезным и готовым к развитию.
          </p>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {aboutApproach.map((item, index) => {
            const Icon = item.icon
            return (
              <Reveal key={item.title} delayMs={index * 80}>
                <article className="group flex h-full flex-col rounded-[1.75rem] border border-border bg-surface p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-accent hover:shadow-[0_0_28px_color-mix(in_srgb,var(--theme-accent)_22%,transparent)] md:p-7">
                  <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-soft text-accent transition-all duration-300 group-hover:border-accent group-hover:shadow-[0_0_16px_color-mix(in_srgb,var(--theme-accent)_40%,transparent)]">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="font-display text-xl font-medium tracking-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {item.text}
                  </p>
                </article>
              </Reveal>
            )
          })}
        </div>
      </Section>

      <Section className="pb-16 md:pb-24">
        <Reveal className="mb-10 max-w-2xl space-y-3 md:mb-14">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Фокус
          </p>
          <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
            Направления
          </h2>
          <p className="text-base leading-relaxed text-muted">
            Работаю с разными форматами digital-проектов — от сайтов до
            ИИ-инструментов и автоматизации.
          </p>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {aboutDirections.map((item, index) => {
            const Icon = item.icon
            const className =
              'group flex h-full flex-col rounded-[1.75rem] border border-border bg-surface p-6 text-left transition-all duration-300 ease-out hover:-translate-y-1 hover:border-accent hover:shadow-[0_0_28px_color-mix(in_srgb,var(--theme-accent)_22%,transparent)] md:p-7'

            const content = (
              <>
                <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-soft text-accent transition-all duration-300 group-hover:border-accent group-hover:shadow-[0_0_16px_color-mix(in_srgb,var(--theme-accent)_40%,transparent)]">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="font-display text-xl font-medium tracking-tight text-ink">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {item.description}
                </p>
              </>
            )

            return (
              <Reveal key={item.title} delayMs={index * 60}>
                {item.filterId ? (
                  <Link
                    to={`/projects?filter=${item.filterId}`}
                    className={className}
                  >
                    {content}
                  </Link>
                ) : (
                  <article className={className}>{content}</article>
                )}
              </Reveal>
            )
          })}
        </div>
      </Section>

      <Section className="pb-16 md:pb-24">
        <Reveal className="mb-10 max-w-2xl space-y-3 md:mb-14">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Процесс
          </p>
          <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
            Как я работаю
          </h2>
          <p className="text-base leading-relaxed text-muted">
            От идеи до запуска — последовательно и без лишней сложности.
          </p>
        </Reveal>

        <div className="relative">
          <div
            className="pointer-events-none absolute top-[2.75rem] right-8 left-8 hidden h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent lg:block"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute top-8 bottom-8 left-[1.65rem] w-px bg-gradient-to-b from-transparent via-accent/50 to-transparent lg:hidden"
            aria-hidden="true"
          />

          <ol className="grid gap-6 lg:grid-cols-4 lg:gap-5">
            {aboutProcess.map((item, index) => (
              <Reveal key={item.step} delayMs={index * 80}>
                <li className="relative flex gap-4 lg:flex-col lg:gap-0">
                  <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-surface shadow-[0_0_18px_color-mix(in_srgb,var(--theme-accent)_28%,transparent)] lg:mb-5">
                    <span className="font-display text-lg font-medium tracking-tight text-brand-gradient">
                      {item.step}
                    </span>
                  </div>
                  <div className="min-w-0 pt-1 lg:pt-0">
                    <h3 className="font-display text-xl font-medium tracking-tight text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {item.text}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      <Section className="pb-16 md:pb-24">
        <Reveal>
          <div className="overflow-hidden rounded-[2rem] border border-border bg-surface">
            <div className="grid items-center gap-8 p-6 md:p-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:p-12">
              <div className="space-y-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  Интересы
                </p>
                <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
                  Что мне интересно
                </h2>
                <p className="max-w-xl text-base leading-relaxed text-muted">
                  {aboutInterestsText}
                </p>
              </div>
              <div className="overflow-hidden rounded-[1.5rem] border border-accent/35 bg-soft glow-brand">
                <img
                  src="/about/interests.png"
                  alt="Идеи, автоматизация и digital-эксперименты OXANA PROJECTS"
                  className="h-auto w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      <Section className="pb-20 md:pb-28">
        <Reveal>
          <div className="rounded-[2rem] border border-accent/40 bg-gradient-to-br from-accent/20 via-soft to-surface px-8 py-12 text-center glow-brand transition-colors duration-300 hover:border-accent/70 md:px-16 md:py-16">
            <div className="mx-auto max-w-2xl space-y-6">
              <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
                Есть идея для проекта?
              </h2>
              <p className="text-base leading-relaxed text-muted">
                Если нужно сделать сайт, бота, приложение, автоматизацию или
                попробовать нестандартную digital-идею — можно обсудить задачу и
                посмотреть, как её реализовать.
              </p>
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button to="/contacts" size="lg">
                  Обсудить проект
                </Button>
                <Button to="/projects" variant="secondary" size="lg">
                  Смотреть проекты
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>
    </div>
  )
}
