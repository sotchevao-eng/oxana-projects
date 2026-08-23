import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { AdminSidebar } from '../components/admin/AdminSidebar'
import { PageTransition } from '../components/PageTransition'
import { ThemeToggle } from '../components/ThemeToggle'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSiteSettings } from '../hooks/useSiteSettings'

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { settings } = useSiteSettings()

  useScrollLock(sidebarOpen && !isDesktop)

  useEffect(() => {
    if (isDesktop) {
      setSidebarOpen(false)
    }
  }, [isDesktop])

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg text-ink">
      <div className="flex min-h-screen">
        <AdminSidebar
          open={sidebarOpen || isDesktop}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur-sm lg:hidden">
            <button
              type="button"
              aria-label="Открыть меню"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink"
            >
              <Menu className="h-4 w-4" />
            </button>
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase">
              {settings.siteName}
            </p>
            <ThemeToggle className="h-9 w-9" />
          </header>

          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="mx-auto w-full max-w-6xl">
              <PageTransition>
                <Outlet />
              </PageTransition>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
