import { LegalDocumentPage } from '../components/LegalDocumentPage'
import { Reveal } from '../components/Reveal'
import { privacyPageMeta, privacySections } from '../data/legal'
import {
  fillOrTodo,
  isFilled,
  SITE_OWNER_TODO,
  siteOwner,
} from '../data/siteOwner'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSiteSettings } from '../hooks/useSiteSettings'

export function PrivacyPage() {
  const { settings } = useSiteSettings()
  const contactEmail =
    siteOwner.privacyEmail.trim() || settings.email.trim() || ''
  const contactExtra =
    siteOwner.privacyContact.trim() ||
    settings.telegram.trim() ||
    settings.phone.trim() ||
    ''

  usePageMeta({
    title: privacyPageMeta.title,
    description: privacyPageMeta.description,
  })

  return (
    <LegalDocumentPage
      eyebrow="Документы"
      title={privacyPageMeta.title}
      updatedAt="24.08.2026"
      intro={`Документ описывает, как сайт ${settings.siteName} обрабатывает персональные данные, которые вы можете передать через форму обратной связи и при использовании сайта.`}
      sections={privacySections}
      afterSections={
        <>
          <Reveal delayMs={80}>
            <article className="rounded-[1.75rem] border border-border bg-surface p-6 md:p-8">
              <h2 className="font-display text-xl font-medium tracking-tight text-ink md:text-2xl">
                11. Контакты
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted md:text-base">
                <p>
                  По вопросам обработки персональных данных можно обратиться к
                  владельцу сайта {settings.siteName}.
                </p>
                <p>
                  Владелец / контактное лицо:{' '}
                  <span className="text-ink">
                    {fillOrTodo(siteOwner.displayName)}
                  </span>
                </p>
                <p>
                  Email:{' '}
                  {isFilled(contactEmail) ? (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="text-ink underline decoration-accent/40 underline-offset-2 transition-colors hover:text-accent"
                    >
                      {contactEmail}
                    </a>
                  ) : (
                    <span className="text-ink">
                      Нужно заполнить владельцу сайта
                    </span>
                  )}
                </p>
                <p>
                  Дополнительный контакт:{' '}
                  <span className="text-ink">{fillOrTodo(contactExtra)}</span>
                </p>
              </div>
            </article>
          </Reveal>

          <Reveal delayMs={100}>
            <article className="rounded-[1.75rem] border border-accent/35 bg-soft/60 p-6 md:p-8">
              <h2 className="font-display text-lg font-medium tracking-tight text-ink md:text-xl">
                Нужно заполнить владельцу сайта
              </h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
                {SITE_OWNER_TODO.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </Reveal>
        </>
      }
      relatedLinks={[
        { label: 'Безопасность и защита данных', to: '/security' },
        { label: 'Контакты', to: '/contacts' },
      ]}
    />
  )
}
