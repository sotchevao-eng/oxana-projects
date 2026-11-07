import { useState } from 'react'
import { OXANA_CABINET_SRC } from '../../../data/oxanaMascot'

interface OxanaMascotProps {
  className?: string
  caption?: string
  compact?: boolean
}

export function OxanaMascot({
  className = '',
  caption = 'ОКСИ',
  compact = false,
}: OxanaMascotProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={`flex ${compact ? 'min-h-[5.5rem]' : 'min-h-[9rem]'} flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-border px-3 py-3 text-center ${className}`}
      >
        <p className="font-display text-sm font-medium tracking-tight text-ink">
          {caption}
        </p>
        <p className="mt-2 max-w-[16rem] text-xs leading-relaxed text-muted">
          Не удалось загрузить изображение ОКСИ.
        </p>
      </div>
    )
  }

  return (
    <div className={`bg-transparent ${className}`}>
      <img
        src={OXANA_CABINET_SRC}
        alt="ОКСИ за ноутбуком"
        className={`mx-auto h-auto w-full bg-transparent object-contain object-center ${
          compact ? 'max-h-28 sm:max-h-36' : 'max-h-64 sm:max-h-72'
        }`}
        width={837}
        height={941}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
