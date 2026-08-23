import { Link, NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  adminPrimaryNav,
  adminSecondaryNav,
  type AdminNavItem,
} from '../../data/adminNavigation'
import { useAuth } from '../../hooks/useAuth'
import { useSiteSettings } from '../../hooks/useSiteSettings'

interface AdminSidebarProps {
  open: boolean
  onClose: () => void
}

function navClassName(isActive: boolean): string {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ${
    isActive
      ? 'bg-soft font-medium text-ink'
      : 'text-muted hover:bg-soft/80 hover:text-ink'
  }`
}

export function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  const { logout, user } = useAuth()
  const { settings } = useSiteSettings()

  const handleItemClick = async (item: AdminNavItem) => {
    if (item.action === 'logout') {
      await logout()
      return
    }
    onClose()
  }

  const renderItem = (item: AdminNavItem) => {
    const Icon = item.icon

    if (item.action === 'logout') {
      return (
        <button
          key={item.label}
          type="button"
          onClick={() => void handleItemClick(item)}
          className={`${navClassName(false)} w-full text-left`}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>{item.label}</span>
        </button>
      )
    }

    if (item.href) {
      return (
        <a
          key={item.label}
          href={item.href}
          onClick={onClose}
          className={navClassName(false)}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>{item.label}</span>
        </a>
      )
    }

    if (!item.to) {
      return null
    }

    if (!item.to.startsWith('/admin')) {
      return (
        <Link
          key={item.label}
          to={item.to}
          onClick={onClose}
          className={navClassName(false)}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>{item.label}</span>
        </Link>
      )
    }

    return (
      <NavLink
        key={item.label}
        to={item.to}
        end={item.end}
        onClick={onClose}
        className={({ isActive }) => navClassName(isActive)}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span>{item.label}</span>
      </NavLink>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="Закрыть меню"
        className={`fixed inset-0 z-40 bg-ink/25 backdrop-blur-[1px] transition-opacity duration-300 lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[16.5rem] flex-col border-r border-border bg-surface transition-transform duration-300 ease-out lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold tracking-[0.14em] text-ink uppercase">
              {settings.siteName}
            </p>
            {user?.email && (
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {user.email}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Админ-меню">
          {adminPrimaryNav.map(renderItem)}
        </nav>

        <div className="space-y-1 border-t border-border p-3">
          {adminSecondaryNav.map(renderItem)}
        </div>
      </aside>
    </>
  )
}
