import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

export interface AuthResult {
  ok: boolean
  error?: string
  session?: Session | null
  user?: User | null
}

export async function getAuthSession(): Promise<Session | null> {
  const client = getSupabaseClient()
  if (!client) {
    return null
  }

  const { data, error } = await client.auth.getSession()
  if (error) {
    return null
  }

  return data.session
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Supabase не настроен. Добавьте ключи в .env.',
    }
  }

  const client = getSupabaseClient()
  if (!client) {
    return {
      ok: false,
      error: 'Не удалось инициализировать Supabase Auth.',
    }
  }

  const trimmedEmail = email.trim()
  if (!trimmedEmail || !password) {
    return {
      ok: false,
      error: 'Введите email и пароль.',
    }
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  })

  if (error) {
    return {
      ok: false,
      error: error.message || 'Не удалось войти.',
    }
  }

  return {
    ok: true,
    session: data.session,
    user: data.user,
  }
}

export async function signOut(): Promise<AuthResult> {
  const client = getSupabaseClient()
  if (!client) {
    return { ok: true, session: null, user: null }
  }

  const { error } = await client.auth.signOut()
  if (error) {
    return {
      ok: false,
      error: error.message || 'Не удалось выйти.',
    }
  }

  return { ok: true, session: null, user: null }
}

export function subscribeToAuthChanges(
  callback: (session: Session | null) => void,
): () => void {
  const client = getSupabaseClient()
  if (!client) {
    callback(null)
    return () => undefined
  }

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })

  return () => {
    subscription.unsubscribe()
  }
}
