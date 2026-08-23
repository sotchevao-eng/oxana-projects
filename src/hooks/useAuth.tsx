import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  getAuthSession,
  signInWithPassword,
  signOut,
  subscribeToAuthChanges,
} from '../services/authService'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<{ ok: boolean; error?: string }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const init = async () => {
      const current = await getAuthSession()
      if (!active) {
        return
      }
      setSession(current)
      setLoading(false)
    }

    void init()

    const unsubscribe = subscribeToAuthChanges((nextSession) => {
      if (!active) {
        return
      }
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string) => {
    const result = await signInWithPassword(email, password)
    if (result.ok) {
      setSession(result.session ?? null)
    }
    return { ok: result.ok, error: result.error }
  }

  const logout = async () => {
    const result = await signOut()
    if (result.ok) {
      setSession(null)
    }
    return { ok: result.ok, error: result.error }
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    isAuthenticated: Boolean(session),
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth должен использоваться внутри AuthProvider')
  }
  return context
}
