import type { LucideIcon } from 'lucide-react'

interface ServiceCardProps {
  title: string
  description: string
  icon: LucideIcon
}

export function ServiceCard({ title, description, icon: Icon }: ServiceCardProps) {
  return (
    <article className="group h-full rounded-3xl border border-border bg-surface p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-accent md:p-8">
      <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-soft text-ink transition-colors duration-300 group-hover:bg-accent">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <h3 className="font-display text-xl font-medium tracking-tight text-ink">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
    </article>
  )
}
