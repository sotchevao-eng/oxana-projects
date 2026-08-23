import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  CheckCircle2,
  Gamepad2,
  GitBranch,
  LayoutTemplate,
  MonitorSmartphone,
  PanelTop,
  Sparkles,
  Workflow,
} from 'lucide-react'
import type { ProjectFilterId } from '../types/filters'

export interface AboutApproachItem {
  title: string
  text: string
  icon: LucideIcon
}

export interface AboutDirectionItem {
  title: string
  description: string
  icon: LucideIcon
  filterId?: ProjectFilterId
}

export interface AboutProcessStep {
  step: string
  title: string
  text: string
}

export const aboutApproach: AboutApproachItem[] = [
  {
    title: 'Понятно',
    text: 'Интерфейс и логика должны быть понятны пользователю без длинных инструкций.',
    icon: PanelTop,
  },
  {
    title: 'Практично',
    text: 'Каждая функция должна решать конкретную задачу, а не существовать ради самой технологии.',
    icon: CheckCircle2,
  },
  {
    title: 'Развиваемо',
    text: 'Проект должен быть готов к новым функциям, интеграциям и дальнейшему развитию.',
    icon: GitBranch,
  },
]

export const aboutDirections: AboutDirectionItem[] = [
  {
    title: 'Сайты',
    description: 'Лендинги, корпоративные сайты и информационные порталы.',
    icon: LayoutTemplate,
    filterId: 'sites',
  },
  {
    title: 'Боты',
    description: 'VK, Telegram, MAX и web-боты для общения и автоматизации.',
    icon: Bot,
    filterId: 'bot',
  },
  {
    title: 'ИИ-инструменты',
    description: 'Ассистенты, генераторы, анализ, интеллектуальные помощники.',
    icon: Sparkles,
    filterId: 'ai-assistants',
  },
  {
    title: 'Автоматизация',
    description: 'Расчёты, заявки, уведомления и автоматизация внутренних процессов.',
    icon: Workflow,
    filterId: 'business',
  },
  {
    title: 'Web-приложения',
    description: 'Калькуляторы, кабинеты, сервисы и внутренние системы.',
    icon: MonitorSmartphone,
    filterId: 'web-apps',
  },
  {
    title: 'Digital-эксперименты',
    description: 'Игры, интерактивы, прототипы и нестандартные идеи.',
    icon: Gamepad2,
    filterId: 'games',
  },
]

export const aboutProcess: AboutProcessStep[] = [
  {
    step: '01',
    title: 'Идея',
    text: 'Определяю задачу, пользователя и то, какой результат должен дать проект.',
  },
  {
    step: '02',
    title: 'Прототип',
    text: 'Продумываю структуру, сценарии, основные функции и интерфейс.',
  },
  {
    step: '03',
    title: 'Разработка',
    text: 'Собираю рабочий продукт, подключаю необходимую логику и интеграции.',
  },
  {
    step: '04',
    title: 'Запуск и развитие',
    text: 'Тестирую, запускаю и постепенно добавляю новые возможности.',
  },
]

export const aboutInterestsText =
  'Мне особенно интересны проекты, где можно объединить разработку, автоматизацию и ИИ. Люблю превращать обычные процессы в удобные digital-инструменты и экспериментировать с форматами, которые не ограничиваются стандартным сайтом.'
