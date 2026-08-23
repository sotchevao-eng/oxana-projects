import { Button } from '../components/Button'
import { Section } from '../components/Section'

export function NotFoundPage() {
  return (
    <Section className="flex min-h-[60vh] items-center py-20">
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          Ошибка 404
        </p>
        <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
          Страница не найдена
        </h1>
        <p className="text-base leading-relaxed text-muted">
          Кажется, такого адреса нет. Вернитесь на главную или посмотрите
          проекты.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button to="/">На главную</Button>
          <Button to="/projects" variant="secondary">
            К проектам
          </Button>
        </div>
      </div>
    </Section>
  )
}
