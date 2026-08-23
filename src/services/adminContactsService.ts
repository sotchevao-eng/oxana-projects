import type { ContactRow, ContactRowStatus } from '../types/database'
import {
  type AdminContact,
  fetchAdminContacts,
} from './adminService'
import { getLocalContactRequests } from './contactService'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

export type AdminContactStatusFilter = ContactRowStatus | 'all'

export const CONTACT_STATUS_OPTIONS: Array<{
  value: ContactRowStatus
  label: string
}> = [
  { value: 'new', label: 'Новая' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Ответ отправлен' },
  { value: 'archived', label: 'Закрыта' },
]

function mapContactRow(row: ContactRow): AdminContact {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    projectType: row.project_type,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  }
}

function getLocalContactById(id: string): AdminContact | null {
  const item = getLocalContactRequests().find((entry) => entry.id === id)
  if (!item) {
    return null
  }

  return {
    id: item.id,
    name: item.name,
    company: item.company || null,
    email: item.email || null,
    phone: item.phoneOrTelegram || null,
    projectType: item.projectType || null,
    message: item.description,
    status: 'local',
    createdAt: item.createdAt,
  }
}

export function isNewContactStatus(status: AdminContact['status']): boolean {
  return status === 'new' || status === 'local'
}

export function matchesContactStatusFilter(
  contact: AdminContact,
  filter: AdminContactStatusFilter,
): boolean {
  if (filter === 'all') {
    return true
  }

  if (filter === 'new') {
    return isNewContactStatus(contact.status)
  }

  return contact.status === filter
}

export function getContactDisplayValue(contact: AdminContact): string {
  const parts = [contact.email, contact.phone].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export async function fetchAdminContactById(
  id: string,
): Promise<{ data: AdminContact | null; error: string | null }> {
  const client = getSupabaseClient()

  if (!client || !isSupabaseConfigured()) {
    return { data: getLocalContactById(id), error: null }
  }

  try {
    const { data, error } = await client
      .from('contacts')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      const local = getLocalContactById(id)
      return {
        data: local,
        error: local ? null : 'Заявка не найдена',
      }
    }

    return { data: mapContactRow(data as ContactRow), error: null }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Не удалось загрузить заявку'
    const local = getLocalContactById(id)
    return {
      data: local,
      error: local ? message : message,
    }
  }
}

export async function updateAdminContactStatus(
  id: string,
  status: ContactRowStatus,
): Promise<{ ok: boolean; data?: AdminContact; error?: string }> {
  const client = getSupabaseClient()

  if (!client || !isSupabaseConfigured()) {
    return {
      ok: false,
      error:
        'Supabase не настроен. Статус локальных заявок изменить нельзя.',
    }
  }

  try {
    const { data, error } = await client
      .from('contacts')
      .update({ status })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return { ok: false, error: 'Заявка не найдена' }
    }

    return { ok: true, data: mapContactRow(data as ContactRow) }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось обновить статус заявки',
    }
  }
}

export { fetchAdminContacts }
