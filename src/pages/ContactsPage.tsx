import { MessageCircle } from 'lucide-react'
import { ContactForm } from '../components/ContactForm'
import { Reveal } from '../components/Reveal'
import { Section } from '../components/Section'
import { SiteContactInfo } from '../components/SiteContactInfo'
import { hasText } from '../data/siteSettings'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSiteSettings } from '../hooks/useSiteSettings'

export function ContactsPage() {
  const { settings } = useSiteSettings()
  usePageMeta({
    title: 'Контакты',
    description: 'Обсудить проект: форма заявки и контакты.',
  })

  return (
    <div>
      <Section className="pb-10 pt-16 md:pb-14 md:pt-24">
        <Reveal className="max-w-2xl space-y-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Контакты
          </p>
          <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
            Обсудить проект
          </h1>
          {hasText(settings.subtitle) ? (
            <p className="text-base leading-relaxed text-muted md:text-lg">
              {settings.subtitle.trim()}
            </p>
          ) : null}
          {hasText(settings.description) ? (
            <p className="text-sm leading-relaxed text-muted md:text-base">
              {settings.description.trim()}
            </p>
          ) : null}
        </Reveal>
      </Section>

      <Section className="pb-20 md:pb-28">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10">
          <Reveal className="space-y-5">
            <SiteContactInfo settings={settings} variant="cards" />

            <div className="rounded-[1.75rem] border border-border bg-surface p-6 md:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-soft text-ink">
                  <MessageCircle className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">
                    Как проходит обсуждение
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Кратко опишите задачу — отвечу и предложу подходящий формат
                    решения.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={80}>
            <div className="rounded-[2rem] border border-border bg-surface p-6 md:p-10">
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </Section>
    </div>
  )
}
