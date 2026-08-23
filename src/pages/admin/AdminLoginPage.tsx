import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ThemeToggle } from '../../components/ThemeToggle'
import { useAuth } from '../../hooks/useAuth'
import { isSupabaseConfigured } from '../../services/supabaseClient'

export function AdminLoginPage() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from?.startsWith('/admin')
      ? (location.state as { from: string }).from
      : '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) {
      return
    }

    setError(null)
    setSubmitting(true)

    const result = await login(email, password)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error ?? 'Не удалось войти')
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-[2rem] border border-border bg-surface p-6 md:p-10">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Админ-панель
          </p>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Вход
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            Войдите через Supabase Auth, чтобы управлять проектами.
          </p>
        </div>

        {!isSupabaseConfigured() && (
          <p className="mt-6 rounded-2xl border border-border bg-soft px-4 py-3 text-sm text-muted">
            Supabase не настроен. Укажите `VITE_SUPABASE_URL` и
            `VITE_SUPABASE_ANON_KEY` в `.env`.
          </p>
        )}

        <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <label htmlFor="admin-email" className="text-sm text-ink">
              Email
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-border bg-bg px-4 py-3.5 text-sm text-ink outline-none transition-colors duration-300 placeholder:text-muted focus:border-ink/30 disabled:opacity-60"
              placeholder="admin@email.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="admin-password" className="text-sm text-ink">
              Пароль
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-border bg-bg px-4 py-3.5 text-sm text-ink outline-none transition-colors duration-300 placeholder:text-muted focus:border-ink/30 disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? 'Входим...' : 'Войти'}
          </Button>
        </form>
      </div>
    </div>
  )
}
