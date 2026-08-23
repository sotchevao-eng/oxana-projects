import type { SiteSettings, SiteSettingsFormValues } from '../types/siteSettings'

export const SITE_SETTINGS_ID = 'main'

export const defaultSiteSettings: SiteSettings = {
  id: SITE_SETTINGS_ID,
  siteName: 'OXANA PROJECTS',
  subtitle: 'Сайты, web-приложения и digital-проекты',
  description:
    'Создаю сайты, web-приложения, автоматизации и digital-решения с акцентом на ясность и аккуратную подачу.',
  email: '',
  phone: '',
  telegram: '',
  vk: '',
  github: '',
  heroImage: '',
  updatedAt: null,
}

export function toSiteSettingsFormValues(
  settings: SiteSettings,
): SiteSettingsFormValues {
  return {
    siteName: settings.siteName,
    subtitle: settings.subtitle,
    description: settings.description,
    email: settings.email,
    phone: settings.phone,
    telegram: settings.telegram,
    vk: settings.vk,
    github: settings.github,
    heroImage: settings.heroImage,
  }
}

export function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}
