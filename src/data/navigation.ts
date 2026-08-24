import type { NavItem } from '../types'
import { defaultSiteSettings } from './siteSettings'

export const siteName = defaultSiteSettings.siteName

export const navItems: NavItem[] = [
  { label: 'Главная', path: '/' },
  { label: 'Проекты', path: '/projects' },
  { label: 'Обо мне', path: '/about' },
  { label: 'Контакты', path: '/contacts' },
]

export const discussProjectPath = '/contacts'

export const adminLoginPath = '/admin/login'

export const legalLinks: NavItem[] = [
  { label: 'Политика конфиденциальности', path: '/privacy' },
  { label: 'Безопасность', path: '/security' },
]
