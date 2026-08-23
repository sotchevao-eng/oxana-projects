export interface SiteSettings {
  id: string
  siteName: string
  subtitle: string
  description: string
  email: string
  phone: string
  telegram: string
  vk: string
  github: string
  heroImage: string
  updatedAt: string | null
}

export type SiteSettingsFormValues = Omit<SiteSettings, 'id' | 'updatedAt'>
