import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Reveal } from '../components/Reveal'
import { Section } from '../components/Section'
import type { LegalSection } from '../data/legal'

interface LegalDocumentPageProps {
  eyebrow: string
  title: string
  updatedAt: string
  intro: string
  sections: LegalSection[]
  afterSections?: ReactNode
  relatedLinks?: Array<{ label: string; to: string }>
}

export function LegalDocumentPage({
  eyebrow,
  title,
  updatedAt,
  intro,
  sections,
  afterSections,
  relatedLinks = [],
}: LegalDocumentPageProps) {
  return (
    <div>
      <Section className="pb-10 pt-16 md:pb-14 md:pt-24">
        <Reveal className="max-w-3xl space-y-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            {eyebrow}
          </p>
          <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="text-sm text-muted">Актуально на {updatedAt}</p>
          <p className="text-base leading-relaxed text-muted md:text-lg">
            {intro}
          </p>
        </Reveal>
      </Section>

      <Section className="pb-10 md:pb-14">
        <div className="mx-auto max-w-3xl space-y-8">
          {sections.map((section, index) => (
            <Reveal key={section.title} delayMs={index * 40}>
              <article className="rounded-[1.75rem] border border-border bg-surface p-6 md:p-8">
                <h2 className="font-display text-xl font-medium tracking-tight text-ink md:text-2xl">
                  {section.title}
                </h2>
                <div className="mt-4 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-relaxed text-muted md:text-base"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}

          {afterSections}
        </div>
      </Section>

      {relatedLinks.length > 0 ? (
        <Section className="pb-20 md:pb-28">
          <Reveal className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {relatedLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-muted transition-colors duration-300 hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </Reveal>
        </Section>
      ) : null}
    </div>
  )
}
