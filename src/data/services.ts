import type { LucideIcon } from 'lucide-react'
import { Gamepad2, LayoutTemplate, MonitorSmartphone, Workflow } from 'lucide-react'

export interface ServiceItem {
  title: string
  description: string
  icon: LucideIcon
}

export const services: ServiceItem[] = [
  {
    title: 'Сайты',
    description: 'Корпоративные, информационные сайты и сайты-приглашения.',
    icon: LayoutTemplate,
  },
  {
    title: 'Web-приложения',
    description: 'CRM, внутренние системы и рабочие кабинеты.',
    icon: MonitorSmartphone,
  },
  {
    title: 'Автоматизация',
    description: 'Учёт, задачи, документы, сроки и отчётность.',
    icon: Workflow,
  },
  {
    title: 'Игры',
    description: 'Браузерные и интерактивные игровые проекты.',
    icon: Gamepad2,
  },
]
