import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { discussProjectPath, navItems } from '../data/navigation'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSiteSettings } from '../hooks/useSiteSettings'
import { Button } from './Button'
import { MobileMenu } from './MobileMenu'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const { settings } = useSiteSettings()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useScrollLock(menuOpen && !isDesktop)

  useEffect(() => {
    if (isDesktop) {
      setMenuOpen(false)
    }
  }, [isDesktop])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <header
        className={`sticky top-0 z-40 border-b transition-all duration-300 ${
          scrolled
            ? 'border-border bg-surface/80 backdrop-blur-md supports-[backdrop-filter]:bg-surface/70'
            : 'border-transparent bg-surface/55 backdrop-blur-sm supports-[backdrop-filter]:bg-surface/45'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6 md:h-20 md:px-10">
          <Link
            to="/"
            className="font-display text-sm font-medium tracking-[0.08em] text-brand-gradient transition-opacity duration-300 hover:opacity-80 md:text-[0.95rem]"
          >
            {settings.siteName}
          </Link>

          <nav
            className="nav-pill-group hidden items-center gap-1 rounded-full p-1.5 lg:flex"
            aria-label="Основная навигация"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `nav-pill rounded-full px-4 py-2 text-sm font-semibold tracking-tight transition-all duration-300 ${
                    isActive ? 'nav-pill-active' : 'nav-pill-idle'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Button
              to={discussProjectPath}
              className="hidden sm:inline-flex"
              size="md"
            >
              Обсудить проект
            </Button>

            <button
              type="button"
              aria-label="Открыть меню"
              aria-expanded={menuOpen}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-ink transition-colors duration-300 hover:bg-soft lg:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
