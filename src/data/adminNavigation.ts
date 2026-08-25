import type { LucideIcon } from 'lucide-react'
import {
  BriefcaseBusiness,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  ExternalLink,
  Settings,
} from 'lucide-react'

export interface AdminNavItem {
  label: string
  to?: string
  href?: string
  icon: LucideIcon
  action?: 'logout'
  end?: boolean
}

export const adminPrimaryNav: AdminNavItem[] = [
  {
    label: 'Dashboard',
    to: '/admin',
    icon: LayoutDashboard,
    end: true,
  },
  {
    label: 'Проекты',
    to: '/admin/projects',
    icon: FolderKanban,
  },
  {
    label: 'Клиентские проекты',
    to: '/admin/client-projects',
    icon: BriefcaseBusiness,
  },
  {
    label: 'Заявки',
    to: '/admin/contacts',
    icon: FileText,
  },
  {
    label: 'Настройки',
    to: '/admin/settings',
    icon: Settings,
  },
]

export const adminSecondaryNav: AdminNavItem[] = [
  {
    label: 'Перейти на сайт',
    to: '/',
    icon: ExternalLink,
  },
  {
    label: 'Выйти',
    icon: LogOut,
    action: 'logout',
  },
]
