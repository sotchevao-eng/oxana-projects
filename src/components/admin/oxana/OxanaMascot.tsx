import { useState } from 'react'
import { OXANA_CABINET_SRC } from '../../../data/oxanaMascot'

interface OxanaMascotProps {
  className?: string
  caption?: string
}

export function OxanaMascot({
  className = '',
  caption = 'ОКСИ',
}: OxanaMascotProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={`flex min-h-[9rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border px-4 py-6 text-center ${className}`}
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
        className="mx-auto h-auto max-h-64 w-full bg-transparent object-contain object-center sm:max-h-72"
        width={837}
        height={941}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
