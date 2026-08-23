import { useEffect, useState } from 'react'
import { hasProjectImage } from '../services/projectsService'
import { ProjectCover } from './ProjectCover'
import type { ProjectCategory } from '../types'

interface SafeImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
  fallbackTitle: string
  fallbackCategory: ProjectCategory
  fallbackBadge?: string
  coverVariant?: 'card' | 'hero' | 'detail'
  coverClassName?: string
}

export function SafeImage({
  src,
  alt,
  className = '',
  loading = 'lazy',
  fallbackTitle,
  fallbackCategory,
  fallbackBadge,
  coverVariant = 'card',
  coverClassName = 'h-full w-full',
}: SafeImageProps) {
  const [failed, setFailed] = useState(false)
  const usable = hasProjectImage(src) && !failed

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!usable) {
    return (
      <ProjectCover
        title={fallbackTitle}
        category={fallbackCategory}
        badge={fallbackBadge}
        variant={coverVariant}
        className={coverClassName}
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
