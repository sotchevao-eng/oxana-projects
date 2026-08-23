import { Link } from 'react-router-dom'
import { hasText } from '../data/siteSettings'
import { adminLoginPath, navItems } from '../data/navigation'
import { useSiteSettings } from '../hooks/useSiteSettings'
import { SiteContactInfo } from './SiteContactInfo'

export function Footer() {
  const { settings } = useSiteSettings()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="space-y-3">
            <Link
              to="/"
              className="font-display text-sm font-medium tracking-[0.08em] text-brand-gradient transition-opacity duration-300 hover:opacity-80"
            >
              {settings.siteName}
            </Link>
            {hasText(settings.subtitle) ? (
              <p className="text-sm text-ink/80">{settings.subtitle.trim()}</p>
            ) : null}
            {hasText(settings.description) ? (
              <p className="max-w-sm text-sm leading-relaxed text-muted">
                {settings.description.trim()}
              </p>
            ) : null}
            <SiteContactInfo settings={settings} variant="inline" />
          </div>

          <nav
            className="flex flex-wrap gap-x-6 gap-y-3"
            aria-label="Навигация в подвале"
          >
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="text-sm text-muted transition-colors duration-300 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-border pt-6 text-sm text-muted sm:flex-row sm:items-center">
          <p>
            © {year} {settings.siteName}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p>Создано с вниманием к деталям</p>
            <Link
              to={adminLoginPath}
              className="text-muted/80 transition-colors duration-300 hover:text-ink"
            >
              Вход
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
