import type { Client, ClientFormValues } from '../types/clientProject'
import type { ClientRow } from '../types/database'
import { clientFormToInsert, mapClientRow } from './clientProjectMappers'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

export interface ClientMutationResult {
  ok: boolean
  data?: Client
  error?: string
}

function requireClient() {
  const client = getSupabaseClient()
  if (!client || !isSupabaseConfigured()) {
    return {
      client: null as null,
      error: 'Supabase не настроен. Добавьте ключи в .env.',
    }
  }
  return { client, error: null }
}

export async function fetchClients(): Promise<{
  data: Client[]
  error: string | null
}> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: [], error }
  }

  const { data, error: queryError } = await client
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (queryError) {
    return { data: [], error: queryError.message }
  }

  return {
    data: ((data ?? []) as ClientRow[]).map(mapClientRow),
    error: null,
  }
}

export async function fetchClientById(
  id: string,
): Promise<{ data: Client | null; error: string | null }> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: null, error }
  }

  const { data, error: queryError } = await client
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (queryError) {
    return { data: null, error: queryError.message }
  }

  return {
    data: data ? mapClientRow(data as ClientRow) : null,
    error: null,
  }
}

export async function createClient(
  values: ClientFormValues,
): Promise<ClientMutationResult> {
  const name = values.name.trim()
  if (!name) {
    return { ok: false, error: 'Укажите имя клиента' }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { data, error: insertError } = await client
    .from('clients')
    .insert(clientFormToInsert(values))
    .select('*')
    .single()

  if (insertError || !data) {
    return { ok: false, error: insertError?.message ?? 'Не удалось создать клиента' }
  }

  return { ok: true, data: mapClientRow(data as ClientRow) }
}

export async function updateClient(
  id: string,
  values: ClientFormValues,
): Promise<ClientMutationResult> {
  const name = values.name.trim()
  if (!name) {
    return { ok: false, error: 'Укажите имя клиента' }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { data, error: updateError } = await client
    .from('clients')
    .update(clientFormToInsert(values))
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !data) {
    return {
      ok: false,
      error: updateError?.message ?? 'Не удалось обновить клиента',
    }
  }

  return { ok: true, data: mapClientRow(data as ClientRow) }
}
