import { Button } from './Button'
import { Reveal } from './Reveal'

interface CtaBannerProps {
  title: string
  description: string
  buttonLabel?: string
  to?: string
}

export function CtaBanner({
  title,
  description,
  buttonLabel = 'Обсудить проект',
  to = '/contacts',
}: CtaBannerProps) {
  return (
    <Reveal>
      <div className="rounded-[2rem] border border-accent/30 bg-gradient-to-br from-soft via-surface to-bg px-8 py-12 text-center shadow-card glow-brand transition-colors duration-300 hover:border-accent/60 md:px-16 md:py-16">
        <div className="mx-auto max-w-2xl space-y-6">
          <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
            {title}
          </h2>
          <p className="text-base leading-relaxed text-muted">{description}</p>
          <Button to={to} size="lg">
            {buttonLabel}
          </Button>
        </div>
      </div>
    </Reveal>
  )
}
