import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useScrollLock } from '../hooks/useScrollLock'
import { hasProjectImage } from '../services/projectsService'
import { Section } from './Section'

interface ProjectGalleryProps {
  images: string[]
  title: string
}

export function ProjectGallery({ images, title }: ProjectGalleryProps) {
  const validImages = images.filter((image) => hasProjectImage(image))
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [broken, setBroken] = useState<Record<string, boolean>>({})

  const isOpen = activeIndex !== null
  const total = validImages.length

  useScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveIndex(null)
        setZoomed(false)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setActiveIndex((current) => {
          if (current === null || total === 0) {
            return current
          }
          return (current - 1 + total) % total
        })
        setZoomed(false)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setActiveIndex((current) => {
          if (current === null || total === 0) {
            return current
          }
          return (current + 1) % total
        })
        setZoomed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, total])

  if (total === 0) {
    return null
  }

  const openAt = (index: number) => {
    setActiveIndex(index)
    setZoomed(false)
  }

  const close = () => {
    setActiveIndex(null)
    setZoomed(false)
  }

  const showPrevious = () => {
    setActiveIndex((current) => {
      if (current === null) {
        return current
      }
      return (current - 1 + total) % total
    })
    setZoomed(false)
  }

  const showNext = () => {
    setActiveIndex((current) => {
      if (current === null) {
        return current
      }
      return (current + 1) % total
    })
    setZoomed(false)
  }

  const activeImage =
    activeIndex !== null ? validImages[activeIndex] : undefined
  const activeBroken = activeImage ? broken[activeImage] : false

  return (
    <>
      <Section className="pb-16 md:pb-24">
        <h2 className="mb-6 font-display text-2xl font-medium tracking-tight md:mb-8">
          Галерея
        </h2>

        <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
          {validImages.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => openAt(index)}
              className="group relative overflow-hidden rounded-[1.75rem] border border-accent/40 bg-soft text-left transition-all duration-500 ease-out hover:-translate-y-1 hover:border-accent hover:shadow-[0_0_24px_color-mix(in_srgb,var(--theme-accent)_35%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {broken[image] ? (
                <div className="flex min-h-40 w-full items-center justify-center px-4 py-10 text-center text-sm text-muted">
                  Не удалось загрузить изображение
                </div>
              ) : (
                <div className="flex min-h-40 items-center justify-center px-3 py-3 sm:px-4 sm:py-4">
                  <img
                    src={image}
                    alt={`${title} — изображение ${index + 1}`}
                    className="h-auto max-h-72 w-auto max-w-full object-contain transition-transform duration-700 ease-out group-hover:scale-[1.02] sm:max-h-80"
                    loading="lazy"
                    decoding="async"
                    onError={() =>
                      setBroken((prev) => ({ ...prev, [image]: true }))
                    }
                  />
                </div>
              )}
              <span className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-full border border-accent/50 bg-surface/90 text-ink opacity-0 shadow-[0_0_16px_color-mix(in_srgb,var(--theme-accent)_40%,transparent)] transition-all duration-300 group-hover:opacity-100">
                <ZoomIn className="h-4 w-4" strokeWidth={1.75} />
              </span>
            </button>
          ))}
        </div>
      </Section>

      {isOpen &&
        activeImage &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm md:p-8"
            role="dialog"
            aria-modal="true"
            aria-label="Просмотр галереи"
            onClick={close}
          >
            <div
              className="absolute top-4 right-4 left-4 flex items-center justify-between gap-3 md:top-6 md:right-6 md:left-6"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="rounded-full border border-white/15 bg-ink/40 px-3 py-1.5 text-sm text-surface tabular-nums backdrop-blur-md">
                {(activeIndex ?? 0) + 1} / {total}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={zoomed ? 'Уменьшить' : 'Увеличить'}
                  onClick={() => setZoomed((value) => !value)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-ink/40 text-surface transition-colors duration-300 hover:bg-ink/60"
                >
                  {zoomed ? (
                    <ZoomOut className="h-5 w-5" strokeWidth={1.75} />
                  ) : (
                    <ZoomIn className="h-5 w-5" strokeWidth={1.75} />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={close}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-ink/40 text-surface transition-colors duration-300 hover:bg-ink/60"
                >
                  <X className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {total > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Предыдущее изображение"
                  onClick={(event) => {
                    event.stopPropagation()
                    showPrevious()
                  }}
                  className="absolute top-1/2 left-3 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink/40 text-surface transition-colors duration-300 hover:bg-ink/60 md:left-6"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label="Следующее изображение"
                  onClick={(event) => {
                    event.stopPropagation()
                    showNext()
                  }}
                  className="absolute top-1/2 right-3 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink/40 text-surface transition-colors duration-300 hover:bg-ink/60 md:right-6"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </>
            )}

            <div
              className="flex max-h-[80vh] max-w-[min(100%,72rem)] items-center justify-center overflow-auto"
              onClick={(event) => event.stopPropagation()}
            >
              {activeBroken ? (
                <p className="rounded-2xl border border-white/15 bg-ink/50 px-6 py-4 text-sm text-surface">
                  Не удалось загрузить изображение
                </p>
              ) : (
                <img
                  src={activeImage}
                  alt={`${title} — изображение ${(activeIndex ?? 0) + 1} из ${total}`}
                  className={`max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl transition-transform duration-300 ease-out ${
                    zoomed
                      ? 'scale-150 cursor-zoom-out'
                      : 'scale-100 cursor-zoom-in'
                  }`}
                  onClick={() => setZoomed((value) => !value)}
                  onError={() =>
                    setBroken((prev) => ({ ...prev, [activeImage]: true }))
                  }
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
