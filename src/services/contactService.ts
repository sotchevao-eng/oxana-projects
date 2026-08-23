import { CONTACT_REQUESTS_STORAGE_KEY } from '../data/contactForm'
import type {
  ContactFormData,
  ContactFormErrors,
  ContactRequestPayload,
  ContactSubmitResult,
} from '../types/contact'
import type { ContactInsertRow } from '../types/database'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

export const emptyContactForm: ContactFormData = {
  name: '',
  company: '',
  email: '',
  phoneOrTelegram: '',
  projectType: '',
  description: '',
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function validateContactForm(data: ContactFormData): ContactFormErrors {
  const errors: ContactFormErrors = {}
  const name = data.name.trim()
  const email = data.email.trim()
  const phoneOrTelegram = data.phoneOrTelegram.trim()
  const description = data.description.trim()

  if (!name) {
    errors.name = 'Укажите имя'
  }

  if (!email && !phoneOrTelegram) {
    errors.contact = 'Укажите email или телефон / Telegram'
  }

  if (email && !isValidEmail(email)) {
    errors.email = 'Проверьте формат email'
  }

  if (!description) {
    errors.description = 'Опишите задачу'
  }

  return errors
}

function toContactInsertRow(data: ContactFormData): ContactInsertRow {
  return {
    name: data.name.trim(),
    company: data.company.trim() || null,
    email: data.email.trim() || null,
    phone: data.phoneOrTelegram.trim() || null,
    project_type: data.projectType || null,
    message: data.description.trim(),
    status: 'new',
  }
}

function createLocalPayload(data: ContactFormData): ContactRequestPayload {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'local',
    name: data.name.trim(),
    company: data.company.trim(),
    email: data.email.trim(),
    phoneOrTelegram: data.phoneOrTelegram.trim(),
    projectType: data.projectType,
    description: data.description.trim(),
  }
}

function saveContactRequestLocally(payload: ContactRequestPayload): void {
  const existingRaw = localStorage.getItem(CONTACT_REQUESTS_STORAGE_KEY)
  const existing: ContactRequestPayload[] = existingRaw
    ? (JSON.parse(existingRaw) as ContactRequestPayload[])
    : []

  existing.unshift(payload)
  localStorage.setItem(CONTACT_REQUESTS_STORAGE_KEY, JSON.stringify(existing))
}

export async function submitContactRequest(
  data: ContactFormData,
): Promise<ContactSubmitResult> {
  const errors = validateContactForm(data)
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: 'Проверьте обязательные поля' }
  }

  const client = getSupabaseClient()

  if (client && isSupabaseConfigured()) {
    try {
      const row = toContactInsertRow(data)
      const { error } = await client.from('contacts').insert(row)

      if (error) {
        throw error
      }

      return { ok: true }
    } catch {
      try {
        saveContactRequestLocally(createLocalPayload(data))
        return { ok: true, savedLocally: true }
      } catch {
        return {
          ok: false,
          error: 'Не удалось отправить заявку. Попробуйте ещё раз.',
        }
      }
    }
  }

  try {
    saveContactRequestLocally(createLocalPayload(data))
    return { ok: true, savedLocally: true }
  } catch {
    return {
      ok: false,
      error: 'Не удалось сохранить заявку. Попробуйте ещё раз.',
    }
  }
}

export function getLocalContactRequests(): ContactRequestPayload[] {
  const existingRaw = localStorage.getItem(CONTACT_REQUESTS_STORAGE_KEY)
  if (!existingRaw) {
    return []
  }

  try {
    return JSON.parse(existingRaw) as ContactRequestPayload[]
  } catch {
    return []
  }
}
