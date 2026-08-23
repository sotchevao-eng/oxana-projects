import { Outlet } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { PageTransition } from '../components/PageTransition'

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-bg text-ink">
      <Header />
      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
    </div>
  )
}
