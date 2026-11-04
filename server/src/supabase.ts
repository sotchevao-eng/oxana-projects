import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function getSupabaseAnon(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim()
  const anon = process.env.SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not configured')
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
