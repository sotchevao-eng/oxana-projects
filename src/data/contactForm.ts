import type { ContactProjectType } from '../types/contact'

export const contactProjectTypeOptions: Array<{
  value: ContactProjectType
  label: string
}> = [
  { value: 'Сайт', label: 'Сайт' },
  { value: 'Web-приложение', label: 'Web-приложение' },
  { value: 'Автоматизация', label: 'Автоматизация' },
  { value: 'Игры', label: 'Игры' },
  { value: 'Мобильное приложение', label: 'Мобильное приложение' },
  { value: 'ИИ-помощники', label: 'ИИ-помощники' },
  { value: 'Бот', label: 'Бот' },
  { value: 'Другое', label: 'Другое' },
]

export const CONTACT_REQUESTS_STORAGE_KEY = 'oxana-projects.contact-requests'
