import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { ThemeToggle } from '../components/ThemeToggle'
import { useSiteSettings } from '../hooks/useSiteSettings'
import { fetchPublicProposal } from '../services/proposalService'
import {
  PROPOSAL_SECTION_TYPE_LABELS,
  type ProposalSectionType,
  type PublicProposalPayload,
  type PublicProposalSection,
} from '../types/proposal'

function sectionHeading(section: PublicProposalSection): string {
  if (section.title?.trim()) {
    return section.title.trim()
  }
  const key = section.section_type as ProposalSectionType
  return PROPOSAL_SECTION_TYPE_LABELS[key] ?? section.section_type
}

function formatContent(content: string | null | undefined): string[] {
  if (!content?.trim()) {
    return []
  }
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function ProposalPage() {
  const { token = '' } = useParams()
  const { settings } = useSiteSettings()
  const [payload, setPayload] = useState<PublicProposalPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!token || token.trim().length < 16) {
        setPayload(null)
        setError('Ссылка недействительна.')
        setLoading(false)
        return
      }

      setLoading(true)
      const result = await fetchPublicProposal(token)
      if (!active) {
        return
      }
      if (!result.data?.ok) {
        setPayload(result.data)
        setError(result.error ?? 'Ссылка недействительна.')
        setLoading(false)
        return
      }
      setPayload(result.data)
      setError(null)
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  if (loading) {
    return (
      <ProposalShell siteName={settings.siteName}>
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">
          Загрузка предложения...
        </div>
      </ProposalShell>
    )
  }

  if (!payload?.ok || !payload.proposal || !payload.project) {
    const notPublished = payload?.error === 'proposal_not_published'
    return (
      <ProposalShell siteName={settings.siteName}>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <h1 className="font-display text-2xl font-medium tracking-tight md:text-3xl">
            {notPublished
              ? 'Предложение пока не опубликовано'
              : 'Ссылка недействительна'}
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            {error ??
              (notPublished
                ? 'Как только коммерческое предложение будет готово, оно появится по этой ссылке.'
                : 'Проверьте ссылку или запросите новую у автора проекта.')}
          </p>
          <Button to="/" variant="secondary">
            На главную
          </Button>
        </div>
      </ProposalShell>
    )
  }

  const { proposal, project, client, sections = [] } = payload
  const title = proposal.title?.trim() || 'Коммерческое предложение'
  const clientLabel = [client?.name, client?.company]
    .filter((item) => item && String(item).trim())
    .join(' · ')

  return (
    <ProposalShell siteName={settings.siteName}>
      <div className="space-y-6 pb-16 sm:pb-10">
        <header className="relative overflow-hidden rounded-[2rem] border border-border bg-surface/90 p-6 shadow-card backdrop-blur-sm sm:p-8 md:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_srgb,var(--theme-accent)_16%,transparent),transparent_55%)]"
          />
          <div className="relative">
            <p className="text-xs font-medium tracking-[0.14em] text-accent uppercase">
              Коммерческое предложение
            </p>
            <h1 className="mt-3 font-display text-3xl font-medium tracking-tight md:text-4xl">
              {title}
            </h1>
            {proposal.subtitle?.trim() ? (
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
                {proposal.subtitle}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span>{project.title}</span>
              {project.project_type ? (
                <span className="text-border">·</span>
              ) : null}
              {project.project_type ? <span>{project.project_type}</span> : null}
              {clientLabel ? <span className="text-border">·</span> : null}
              {clientLabel ? <span>{clientLabel}</span> : null}
            </div>
            {proposal.intro?.trim() ? (
              <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink/90 md:text-base">
                {proposal.intro}
              </p>
            ) : null}

            {(proposal.price?.trim() || proposal.deadline?.trim()) && (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {proposal.price?.trim() ? (
                  <div className="rounded-2xl border border-accent/35 bg-accent/10 px-4 py-4">
                    <p className="text-xs tracking-[0.08em] text-muted uppercase">
                      Стоимость
                    </p>
                    <p className="mt-1 font-display text-xl font-medium text-ink md:text-2xl">
                      {proposal.price}
                    </p>
                  </div>
                ) : null}
                {proposal.deadline?.trim() ? (
                  <div className="rounded-2xl border border-border bg-soft/60 px-4 py-4">
                    <p className="text-xs tracking-[0.08em] text-muted uppercase">
                      Срок
                    </p>
                    <p className="mt-1 font-display text-xl font-medium text-ink md:text-2xl">
                      {proposal.deadline}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </header>

        {sections.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-border px-6 py-12 text-center text-sm text-muted">
            Содержание предложения скоро появится.
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section, index) => {
              const lines = formatContent(section.content)
              return (
                <section
                  key={`${section.section_type}-${section.sort_order}-${index}`}
                  className="rounded-[1.5rem] border border-border bg-surface/95 p-5 sm:p-6 md:p-7"
                >
                  <h2 className="font-display text-lg font-medium tracking-tight md:text-xl">
                    {sectionHeading(section)}
                  </h2>
                  {lines.length > 0 ? (
                    <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted md:text-[0.95rem]">
                      {lines.map((line) => (
                        <p key={line.slice(0, 40) + line.length}>{line}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted">—</p>
                  )}
                </section>
              )
            })}
          </div>
        )}

        <div className="rounded-[2rem] border border-border bg-surface/90 p-6 text-center shadow-card sm:p-8">
          <p className="font-display text-xl font-medium tracking-tight md:text-2xl">
            Готовы обсудить детали?
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            Напишите, если предложение подходит или нужны уточнения — ответим и
            согласуем следующий шаг.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button to="/contacts">Связаться</Button>
            <Button to="/" variant="secondary">
              На главную
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted">
            Принятие КП и запрос изменений — следующий этап.
          </p>
        </div>
      </div>
    </ProposalShell>
  )
}

function ProposalShell({
  siteName,
  children,
}: {
  siteName: string
  children: ReactNode
}) {
  return (
    <div className="relative mx-auto min-h-[70vh] max-w-3xl px-4 py-8 sm:px-6 sm:py-10 md:px-10 md:py-14">
      <div className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
        <Link
          to="/"
          className="font-display text-sm font-medium tracking-[0.08em] text-brand-gradient"
        >
          {siteName || 'OXANA PROJECTS'}
        </Link>
        <ThemeToggle />
      </div>
      {children}
    </div>
  )
}
