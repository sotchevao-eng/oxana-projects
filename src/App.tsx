import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ScrollToTop } from './components/ScrollToTop'
import { ToastProvider } from './components/ToastProvider'
import { AuthProvider } from './hooks/useAuth'
import { SiteSettingsProvider } from './hooks/useSiteSettings'
import { ThemeProvider } from './hooks/useTheme'
import { AdminLayout } from './layouts/AdminLayout'
import { MainLayout } from './layouts/MainLayout'
import { AboutPage } from './pages/AboutPage'
import { AdminContactDetailPage } from './pages/admin/AdminContactDetailPage'
import { AdminContactsPage } from './pages/admin/AdminContactsPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminLoginPage } from './pages/admin/AdminLoginPage'
import { AdminNotFoundPage } from './pages/admin/AdminNotFoundPage'
import { AdminProjectEditPage } from './pages/admin/AdminProjectEditPage'
import { AdminProjectNewPage } from './pages/admin/AdminProjectNewPage'
import { AdminProjectsPage } from './pages/admin/AdminProjectsPage'
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage'
import { ContactsPage } from './pages/ContactsPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SiteSettingsProvider>
            <ToastProvider>
              <ScrollToTop />
              <Routes>
                <Route element={<MainLayout />}>
                  <Route index element={<HomePage />} />
                  <Route path="projects" element={<ProjectsPage />} />
                  <Route path="projects/:slug" element={<ProjectDetailPage />} />
                  <Route path="about" element={<AboutPage />} />
                  <Route path="contacts" element={<ContactsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                <Route path="admin/login" element={<AdminLoginPage />} />

                <Route path="admin" element={<ProtectedRoute />}>
                  <Route element={<AdminLayout />}>
                    <Route index element={<AdminDashboardPage />} />
                    <Route path="projects" element={<AdminProjectsPage />} />
                    <Route path="projects/new" element={<AdminProjectNewPage />} />
                    <Route
                      path="projects/:id/edit"
                      element={<AdminProjectEditPage />}
                    />
                    <Route path="contacts" element={<AdminContactsPage />} />
                    <Route
                      path="contacts/:id"
                      element={<AdminContactDetailPage />}
                    />
                    <Route path="settings" element={<AdminSettingsPage />} />
                    <Route path="*" element={<AdminNotFoundPage />} />
                  </Route>
                </Route>
              </Routes>
            </ToastProvider>
          </SiteSettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
