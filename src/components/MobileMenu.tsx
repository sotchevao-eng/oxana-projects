import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { discussProjectPath, navItems } from '../data/navigation'
import { useSiteSettings } from '../hooks/useSiteSettings'
import { Button } from './Button'
import { ThemeToggle } from './ThemeToggle'

interface MobileMenuProps {
  open: boolean
  onClose: () => void
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const { settings } = useSiteSettings()

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Закрыть меню"
        className={`absolute inset-0 bg-ink/20 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-[min(100%,22rem)] flex-col border-l border-border bg-surface shadow-xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <span className="font-display text-sm font-medium tracking-[0.08em] text-brand-gradient">
            {settings.siteName}
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Закрыть меню"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-ink transition-colors duration-300 hover:bg-soft"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-4 py-6" aria-label="Мобильная навигация">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `rounded-2xl px-4 py-3.5 text-base font-semibold tracking-tight transition-all duration-300 ${
                  isActive ? 'nav-pill-active' : 'nav-pill-idle border border-transparent'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-6">
          <Button to={discussProjectPath} className="w-full" onClick={onClose}>
            Обсудить проект
          </Button>
        </div>
      </aside>
    </div>
  )
}
