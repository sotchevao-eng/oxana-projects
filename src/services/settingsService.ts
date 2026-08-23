import {
  defaultSiteSettings,
  SITE_SETTINGS_ID,
} from '../data/siteSettings'
import type { SiteSettings, SiteSettingsFormValues } from '../types/siteSettings'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

export interface SiteSettingsRow {
  id: string
  site_name: string
  subtitle: string | null
  description: string | null
  email: string | null
  phone: string | null
  telegram: string | null
  vk: string | null
  github: string | null
  hero_image: string | null
  updated_at: string | null
}

function normalize(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

export function mapSiteSettingsRow(row: SiteSettingsRow): SiteSettings {
  return {
    id: row.id,
    siteName: normalize(row.site_name) || defaultSiteSettings.siteName,
    subtitle: normalize(row.subtitle),
    description: normalize(row.description),
    email: normalize(row.email),
    phone: normalize(row.phone),
    telegram: normalize(row.telegram),
    vk: normalize(row.vk),
    github: normalize(row.github),
    heroImage: normalize(row.hero_image),
    updatedAt: row.updated_at,
  }
}

function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toUpdateRow(values: SiteSettingsFormValues): Partial<SiteSettingsRow> {
  return {
    site_name: values.siteName.trim() || defaultSiteSettings.siteName,
    subtitle: toNullable(values.subtitle),
    description: toNullable(values.description),
    email: toNullable(values.email),
    phone: toNullable(values.phone),
    telegram: toNullable(values.telegram),
    vk: toNullable(values.vk),
    github: toNullable(values.github),
    hero_image: toNullable(values.heroImage),
    updated_at: new Date().toISOString(),
  }
}

function ensureAbsoluteUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  return `https://${value.replace(/^\/+/, '')}`
}

export function toTelegramHref(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('t.me/')) {
    return ensureAbsoluteUrl(trimmed.replace(/^@/, ''))
  }

  return `https://t.me/${trimmed.replace(/^@/, '')}`
}

export function toVkHref(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed) || /vk\.com\//i.test(trimmed)) {
    return ensureAbsoluteUrl(trimmed)
  }

  return `https://vk.com/${trimmed.replace(/^@/, '')}`
}

export function toGithubHref(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed) || /github\.com\//i.test(trimmed)) {
    return ensureAbsoluteUrl(trimmed)
  }

  return `https://github.com/${trimmed.replace(/^@/, '')}`
}

export function toMailtoHref(email: string): string | null {
  const trimmed = email.trim()
  return trimmed ? `mailto:${trimmed}` : null
}

export function toTelHref(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed) {
    return null
  }

  const digits = trimmed.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : null
}

export async function fetchSiteSettings(): Promise<{
  data: SiteSettings
  error: string | null
}> {
  const client = getSupabaseClient()

  if (!client || !isSupabaseConfigured()) {
    return { data: defaultSiteSettings, error: null }
  }

  try {
    const { data, error } = await client
      .from('site_settings')
      .select('*')
      .eq('id', SITE_SETTINGS_ID)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return { data: defaultSiteSettings, error: null }
    }

    return { data: mapSiteSettingsRow(data as SiteSettingsRow), error: null }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Не удалось загрузить настройки сайта'

    return { data: defaultSiteSettings, error: message }
  }
}

export async function saveSiteSettings(
  values: SiteSettingsFormValues,
): Promise<{ ok: boolean; data?: SiteSettings; error?: string }> {
  const client = getSupabaseClient()

  if (!client || !isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Supabase не настроен. Сохранение настроек недоступно.',
    }
  }

  const siteName = values.siteName.trim()
  if (!siteName) {
    return { ok: false, error: 'Укажите название сайта' }
  }

  try {
    const payload = {
      id: SITE_SETTINGS_ID,
      ...toUpdateRow({ ...values, siteName }),
    }

    const { data, error } = await client
      .from('site_settings')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return { ok: true, data: mapSiteSettingsRow(data as SiteSettingsRow) }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить настройки',
    }
  }
}
