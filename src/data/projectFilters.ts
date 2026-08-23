import type { ProjectFilterOption, ProjectSortOption } from '../types/filters'

export const projectFilterOptions: ProjectFilterOption[] = [
  { id: 'all', label: 'Все' },
  { id: 'sites', label: 'Сайт' },
  { id: 'web-apps', label: 'Web-приложение' },
  { id: 'business', label: 'Бизнес' },
  { id: 'games', label: 'Игры' },
  { id: 'mobile', label: 'Мобильное приложение' },
  { id: 'ai-assistants', label: 'ИИ-помощники' },
  { id: 'bot', label: 'Бот' },
]

export const projectSortOptions: ProjectSortOption[] = [
  { id: 'newest', label: 'Сначала новые' },
  { id: 'oldest', label: 'Сначала старые' },
  { id: 'title', label: 'По названию' },
  { id: 'featured', label: 'Избранные' },
]
