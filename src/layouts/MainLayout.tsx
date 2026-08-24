import { Outlet } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { LightTechBackdrop } from '../components/LightTechBackdrop'
import { PageTransition } from '../components/PageTransition'

export function MainLayout() {
  return (
    <>
      <LightTechBackdrop />
      <div className="site-shell flex min-h-screen flex-col overflow-x-hidden bg-transparent text-ink">
        <Header />
        <main className="flex-1">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
        <Footer />
      </div>
    </>
  )
}
