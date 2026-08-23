export type ProjectCategory =
  | 'Сайт'
  | 'Web-приложение'
  | 'Автоматизация'
  | 'Игры'
  | 'Мобильное приложение'
  | 'ИИ-помощники'
  | 'Бот'

export type ProjectStatus = 'published' | 'draft' | 'archived'

export interface ProjectGalleryImage {
  id: string | null
  url: string
  alt: string | null
  sortOrder: number
}

export interface Project {
  id: string
  title: string
  slug: string
  shortDescription: string
  description: string
  /** Подраздел «Задача». Если null — берётся из shortDescription. */
  task: string | null
  /** Подраздел «Решение». Если null — берётся из description. */
  solution: string | null
  /** Подраздел «Результат». Если null — показывается запасной текст. */
  result: string | null
  /** Одна или несколько категорий проекта */
  categories: ProjectCategory[]
  status: ProjectStatus
  year: number
  eventDate: string | null
  coverImage: string | null
  cardImage: string | null
  gallery: string[]
  galleryImages?: ProjectGalleryImage[]
  demoUrl: string | null
  websiteUrl: string | null
  githubUrl: string | null
  technologies: string[]
  tags: string[]
  /** Адаптивность интерфейса / сайта. */
  responsive: boolean
  featured: boolean
  sortOrder: number
  seoTitle: string | null
  seoDescription: string | null
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export interface NavItem {
  label: string
  path: string
}

export type {
  ContactFormData,
  ContactFormErrors,
  ContactProjectType,
  ContactRequestPayload,
  ContactSubmitResult,
} from './contact'

export type {
  ProjectFilterId,
  ProjectFilterOption,
  ProjectSortId,
  ProjectSortOption,
} from './filters'

export type { SiteSettings, SiteSettingsFormValues } from './siteSettings'
