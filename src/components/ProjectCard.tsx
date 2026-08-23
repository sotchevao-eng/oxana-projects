import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { Project } from '../types'
import {
  formatProjectCategories,
  getPrimaryCategory,
} from '../services/projectsService'
import { SafeImage } from './SafeImage'

type ProjectCardVariant = 'default' | 'large'

interface ProjectCardProps {
  project: Project
  variant?: ProjectCardVariant
}

const variantStyles: Record<
  ProjectCardVariant,
  {
    media: string
    image: string
    body: string
    title: string
    description: string
    meta: string
    year: string
    arrow: string
  }
> = {
  default: {
    media: 'min-h-40',
    image: 'max-h-64 sm:max-h-72',
    body: 'gap-4 px-5 py-5 sm:px-6 sm:py-6',
    title: 'text-lg sm:text-xl',
    description: 'text-sm leading-relaxed',
    meta: 'text-[11px] tracking-[0.16em]',
    year: 'text-xs',
    arrow: 'h-9 w-9',
  },
  large: {
    media: 'min-h-44',
    image: 'max-h-72 sm:max-h-80',
    body: 'gap-5 px-5 py-6 sm:px-7 sm:py-8 md:px-8',
    title: 'text-xl sm:text-2xl md:text-[1.65rem]',
    description: 'text-sm leading-relaxed sm:text-base',
    meta: 'text-[11px] tracking-[0.16em] sm:text-xs',
    year: 'text-xs sm:text-sm',
    arrow: 'h-10 w-10',
  },
}

export function ProjectCard({
  project,
  variant = 'default',
}: ProjectCardProps) {
  const styles = variantStyles[variant]
  const imageSrc = project.coverImage ?? project.cardImage

  return (
    <Link
      to={`/projects/${project.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border/80 bg-surface transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5 hover:border-accent/80 hover:shadow-[0_22px_50px_rgba(29,29,31,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-soft px-3 py-3 sm:px-4 sm:py-4 ${styles.media}`}
      >
        <SafeImage
          src={imageSrc}
          alt={project.title}
          className={`h-auto w-auto max-w-full object-contain transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.02] ${styles.image}`}
          loading="lazy"
          fallbackTitle={project.title}
          fallbackCategory={getPrimaryCategory(project)}
          coverClassName={`h-40 w-full sm:h-48 ${styles.image}`}
        />
      </div>

      <div className={`flex flex-1 flex-col ${styles.body}`}>
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium uppercase text-muted ${styles.meta}`}
          >
            <span className="truncate">{formatProjectCategories(project)}</span>
          </div>
          <span className={`shrink-0 tabular-nums text-muted ${styles.year}`}>
            {project.year}
          </span>
        </div>

        <div className="mt-3 flex flex-1 items-end justify-between gap-4 sm:mt-4">
          <div className="min-w-0 space-y-2 sm:space-y-3">
            <h3
              className={`font-display font-medium tracking-tight text-ink transition-colors duration-300 group-hover:text-ink/90 ${styles.title}`}
            >
              {project.title}
            </h3>
            <p className={`text-muted ${styles.description}`}>
              {project.shortDescription}
            </p>
          </div>

          <span
            className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full border border-border bg-bg text-ink transition-[transform,background-color,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1 group-hover:border-accent group-hover:bg-brand-gradient group-hover:text-white ${styles.arrow}`}
            aria-hidden="true"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </span>
        </div>
      </div>
    </Link>
  )
}
