import { CONTACT_REQUESTS_STORAGE_KEY } from '../data/contactForm'
import type {
  ContactFormData,
  ContactFormErrors,
  ContactRequestPayload,
  ContactSubmitResult,
} from '../types/contact'
import type { ContactInsertRow } from '../types/database'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

export const CONTACT_FIELD_LIMITS = {
  name: 100,
  company: 150,
  email: 254,
  phoneOrTelegram: 80,
  description: 4000,
  /** Honeypot: должен оставаться пустым */
  website: 200,
} as const

/**
 * Точки расширения антиспама без подключения стороннего сервиса:
 * - honeypot-поле `website` в форме;
 * - клиентский cooldown между отправками;
 * - при необходимости позже: server-side rate limit / captcha на edge.
 */
export const CONTACT_SUBMIT_COOLDOWN_MS = 12_000

export const emptyContactForm: ContactFormData = {
  name: '',
  company: '',
  email: '',
  phoneOrTelegram: '',
  projectType: '',
  description: '',
  consent: false,
  website: '',
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidPhoneOrTelegram(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  if (trimmed.startsWith('@')) {
    return /^@[a-zA-Z0-9_]{3,32}$/.test(trimmed)
  }

  if (/^https?:\/\/t\.me\//i.test(trimmed) || /^t\.me\//i.test(trimmed)) {
    return trimmed.length <= CONTACT_FIELD_LIMITS.phoneOrTelegram
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 10 && digits.length <= 15) {
    return true
  }

  // Свободный контактный текст (например, "telegram: name") — допускаем умеренную длину
  return trimmed.length >= 3 && trimmed.length <= CONTACT_FIELD_LIMITS.phoneOrTelegram
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max)
}

export function validateContactForm(data: ContactFormData): ContactFormErrors {
  const errors: ContactFormErrors = {}
  const name = data.name.trim()
  const email = normalizeEmail(data.email)
  const phoneOrTelegram = data.phoneOrTelegram.trim()
  const description = data.description.trim()

  if (!name) {
    errors.name = 'Укажите имя'
  } else if (name.length > CONTACT_FIELD_LIMITS.name) {
    errors.name = `Имя слишком длинное (до ${CONTACT_FIELD_LIMITS.name} символов)`
  }

  if (data.company.trim().length > CONTACT_FIELD_LIMITS.company) {
    errors.company = `Слишком длинное название (до ${CONTACT_FIELD_LIMITS.company} символов)`
  }

  if (!email && !phoneOrTelegram) {
    errors.contact = 'Укажите email или телефон / Telegram'
  }

  if (email) {
    if (email.length > CONTACT_FIELD_LIMITS.email) {
      errors.email = 'Email слишком длинный'
    } else if (!isValidEmail(email)) {
      errors.email = 'Проверьте формат email'
    }
  }

  if (phoneOrTelegram && !isValidPhoneOrTelegram(phoneOrTelegram)) {
    errors.phoneOrTelegram =
      'Проверьте телефон или Telegram (@username / +7...)'
  }

  if (!description) {
    errors.description = 'Опишите задачу'
  } else if (description.length > CONTACT_FIELD_LIMITS.description) {
    errors.description = `Текст слишком длинный (до ${CONTACT_FIELD_LIMITS.description} символов)`
  }

  if (!data.consent) {
    errors.consent = 'Необходимо согласиться с обработкой персональных данных.'
  }

  return errors
}

function toContactInsertRow(data: ContactFormData): ContactInsertRow {
  return {
    name: clip(data.name, CONTACT_FIELD_LIMITS.name),
    company: clip(data.company, CONTACT_FIELD_LIMITS.company) || null,
    email: normalizeEmail(data.email).slice(0, CONTACT_FIELD_LIMITS.email) || null,
    phone: clip(data.phoneOrTelegram, CONTACT_FIELD_LIMITS.phoneOrTelegram) || null,
    project_type: data.projectType || null,
    message: clip(data.description, CONTACT_FIELD_LIMITS.description),
    status: 'new',
  }
}

function createLocalPayload(data: ContactFormData): ContactRequestPayload {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'local',
    name: clip(data.name, CONTACT_FIELD_LIMITS.name),
    company: clip(data.company, CONTACT_FIELD_LIMITS.company),
    email: normalizeEmail(data.email).slice(0, CONTACT_FIELD_LIMITS.email),
    phoneOrTelegram: clip(
      data.phoneOrTelegram,
      CONTACT_FIELD_LIMITS.phoneOrTelegram,
    ),
    projectType: data.projectType,
    description: clip(data.description, CONTACT_FIELD_LIMITS.description),
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

let lastSubmitAt = 0

export async function submitContactRequest(
  data: ContactFormData,
): Promise<ContactSubmitResult> {
  // Honeypot: боты часто заполняют скрытое поле
  if (data.website.trim()) {
    return { ok: true }
  }

  const now = Date.now()
  if (now - lastSubmitAt < CONTACT_SUBMIT_COOLDOWN_MS) {
    return {
      ok: false,
      error: 'Подождите немного перед повторной отправкой.',
    }
  }

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

      lastSubmitAt = now
      return { ok: true }
    } catch {
      try {
        saveContactRequestLocally(createLocalPayload(data))
        lastSubmitAt = now
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
    lastSubmitAt = now
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
