import type { ProjectCategory } from '../types'

interface ProjectCoverProps {
  title: string
  category: ProjectCategory
  badge?: string
  className?: string
  variant?: 'card' | 'hero' | 'detail'
}

const toneByCategory: Record<
  ProjectCategory,
  { panel: string; accent: string; soft: string }
> = {
  Сайт: {
    panel: 'bg-soft',
    accent: 'bg-accent',
    soft: 'bg-surface',
  },
  'Web-приложение': {
    panel: 'bg-soft',
    accent: 'bg-brand-blue',
    soft: 'bg-surface',
  },
  Автоматизация: {
    panel: 'bg-soft',
    accent: 'bg-brand-violet',
    soft: 'bg-surface',
  },
  Игры: {
    panel: 'bg-soft',
    accent: 'bg-brand-purple',
    soft: 'bg-surface',
  },
  'Мобильное приложение': {
    panel: 'bg-soft',
    accent: 'bg-accent',
    soft: 'bg-surface',
  },
  'ИИ-помощники': {
    panel: 'bg-soft',
    accent: 'bg-brand-blue',
    soft: 'bg-surface',
  },
  Бот: {
    panel: 'bg-soft',
    accent: 'bg-brand-violet',
    soft: 'bg-surface',
  },
}

export function ProjectCover({
  title,
  category,
  badge,
  className = '',
  variant = 'card',
}: ProjectCoverProps) {
  const tone = toneByCategory[category]
  const compact = variant === 'card'
  const label = badge ?? category

  return (
    <div
      className={`relative overflow-hidden ${tone.panel} ${className}`}
      aria-hidden={variant !== 'detail'}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(232,215,211,0.45),transparent_45%)]" />

      <div
        className={`relative flex h-full flex-col ${
          compact ? 'p-5 md:p-6' : 'p-6 md:p-8'
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-border" />
            <span className="h-2 w-2 rounded-full bg-border" />
            <span className="h-2 w-2 rounded-full bg-border" />
          </div>
          <span className="rounded-full border border-border/80 bg-surface/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-muted">
            {label}
          </span>
        </div>

        <div className="mb-4 rounded-2xl border border-border/70 bg-surface/90 p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className={`h-7 w-7 rounded-lg ${tone.accent}`} />
            <div className="space-y-1.5">
              <div className="h-2 w-20 rounded-full bg-border" />
              <div className="h-1.5 w-12 rounded-full bg-soft" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className={`h-14 rounded-xl ${tone.soft}`} />
            <div className={`h-14 rounded-xl ${tone.soft}`} />
            <div className={`h-14 rounded-xl ${tone.soft}`} />
          </div>
        </div>

        <div className="mt-auto space-y-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
            Preview
          </p>
          <p className="font-display text-sm font-medium tracking-tight text-ink md:text-base">
            {title}
          </p>
          <div className="flex gap-2 pt-1">
            <div className="h-1.5 w-16 rounded-full bg-border" />
            <div className="h-1.5 w-10 rounded-full bg-soft" />
          </div>
        </div>
      </div>
    </div>
  )
}
