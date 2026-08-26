import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { Button } from '../components/Button'
import { ThemeToggle } from '../components/ThemeToggle'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSiteSettings } from '../hooks/useSiteSettings'
import {
  acceptPublicProposal,
  fetchPublicProposal,
  requestPublicProposalChanges,
} from '../services/proposalService'
import {
  PROPOSAL_SECTION_TYPE_LABELS,
  type ProposalSectionType,
  type PublicProposalPayload,
  type PublicProposalSection,
} from '../types/proposal'

const fieldClass =
  'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-60'

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
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [actionNotice, setActionNotice] = useState<
    'accepted' | 'changes_requested' | null
  >(null)

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
      const status = result.data.proposal?.status
      if (status === 'accepted' || status === 'changes_requested') {
        setActionNotice(status)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  const applyLocalStatus = (status: 'accepted' | 'changes_requested') => {
    setActionNotice(status)
    setPayload((prev) => {
      if (!prev?.ok || !prev.proposal) {
        return prev
      }
      return {
        ...prev,
        proposal: {
          ...prev.proposal,
          status,
        },
      }
    })
    setAcceptOpen(false)
    setChangesOpen(false)
  }

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
  const status = proposal.status
  const isTerminal =
    status === 'accepted' ||
    status === 'changes_requested' ||
    actionNotice === 'accepted' ||
    actionNotice === 'changes_requested'
  const showAccepted =
    status === 'accepted' || actionNotice === 'accepted'
  const showChanges =
    !showAccepted &&
    (status === 'changes_requested' || actionNotice === 'changes_requested')

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
                      {lines.map((line, lineIndex) => (
                        <p key={`${index}-${lineIndex}`}>{line}</p>
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
          {showAccepted ? (
            <>
              <p className="font-display text-xl font-medium tracking-tight md:text-2xl">
                Предложение принято. Спасибо!
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
                Мы свяжемся с вами и согласуем следующий шаг.
              </p>
              <div className="mt-6">
                <Button to="/" variant="secondary">
                  На главную
                </Button>
              </div>
            </>
          ) : showChanges ? (
            <>
              <p className="font-display text-xl font-medium tracking-tight md:text-2xl">
                Запрос на изменения отправлен.
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
                Изучим комментарий и вернёмся с обновлённым предложением.
              </p>
              <div className="mt-6">
                <Button to="/" variant="secondary">
                  На главную
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="font-display text-xl font-medium tracking-tight md:text-2xl">
                Готовы двигаться дальше?
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
                Примите предложение или опишите, что нужно уточнить.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={() => setAcceptOpen(true)}>
                  Принять предложение
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setChangesOpen(true)}
                >
                  Нужны изменения
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {!isTerminal || acceptOpen || changesOpen ? (
        <>
          <AcceptProposalModal
            open={acceptOpen}
            token={token}
            onClose={() => setAcceptOpen(false)}
            onSuccess={() => applyLocalStatus('accepted')}
          />
          <ChangesProposalModal
            open={changesOpen}
            token={token}
            onClose={() => setChangesOpen(false)}
            onSuccess={() => applyLocalStatus('changes_requested')}
          />
        </>
      ) : null}
    </ProposalShell>
  )
}

function AcceptProposalModal({
  open,
  token,
  onClose,
  onSuccess,
}: {
  open: boolean
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    setName('')
    setComment('')
    setConfirmed(false)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  if (!open) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Укажите имя.')
      return
    }
    if (!confirmed) {
      setError('Подтвердите принятие предложения.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await acceptPublicProposal(token, name, comment)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Не удалось принять предложение.')
      return
    }
    onSuccess()
  }

  return createPortal(
    <ModalShell title="Принять предложение" onClose={onClose} busy={submitting}>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs text-muted">Имя</label>
          <input
            className={fieldClass}
            value={name}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs text-muted">
            Комментарий <span className="text-muted/70">(необязательно)</span>
          </label>
          <textarea
            className={fieldClass}
            rows={3}
            maxLength={2000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>Я подтверждаю принятие коммерческого предложения</span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button type="submit" disabled={submitting || !confirmed}>
            {submitting ? 'Отправка...' : 'Принять'}
          </Button>
        </div>
      </form>
    </ModalShell>,
    document.body,
  )
}

function ChangesProposalModal({
  open,
  token,
  onClose,
  onSuccess,
}: {
  open: boolean
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    setName('')
    setComment('')
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  if (!open) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Укажите имя.')
      return
    }
    if (!comment.trim()) {
      setError('Опишите, какие изменения нужны.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await requestPublicProposalChanges(token, name, comment)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Не удалось отправить запрос.')
      return
    }
    onSuccess()
  }

  return createPortal(
    <ModalShell title="Нужны изменения" onClose={onClose} busy={submitting}>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs text-muted">Имя</label>
          <input
            className={fieldClass}
            value={name}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs text-muted">Комментарий</label>
          <textarea
            className={fieldClass}
            rows={4}
            maxLength={2000}
            required
            placeholder="Что нужно изменить или уточнить?"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Отправка...' : 'Отправить запрос'}
          </Button>
        </div>
      </form>
    </ModalShell>,
    document.body,
  )
}

function ModalShell({
  title,
  onClose,
  busy,
  children,
}: {
  title: string
  onClose: () => void
  busy?: boolean
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        aria-label="Закрыть"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-surface shadow-card sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            className="rounded-lg border border-border p-2 text-muted hover:text-ink"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
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
