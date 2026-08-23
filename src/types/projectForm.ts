import type { Project, ProjectCategory, ProjectStatus, ProjectGalleryImage } from '../types'

export interface ProjectFormValues {
  title: string
  slug: string
  shortDescription: string
  description: string
  task: string
  solution: string
  result: string
  categories: ProjectCategory[]
  year: string
  eventDate: string
  status: ProjectStatus
  coverImage: string
  cardImage: string
  demoUrl: string
  websiteUrl: string
  githubUrl: string
  technologies: string
  tags: string
  featured: boolean
  sortOrder: string
  seoTitle: string
  seoDescription: string
  galleryImages: ProjectGalleryImage[]
}

export const emptyProjectForm: ProjectFormValues = {
  title: '',
  slug: '',
  shortDescription: '',
  description: '',
  task: '',
  solution: '',
  result: '',
  categories: ['Сайт'],
  year: String(new Date().getFullYear()),
  eventDate: '',
  status: 'draft',
  coverImage: '',
  cardImage: '',
  demoUrl: '',
  websiteUrl: '',
  githubUrl: '',
  technologies: '',
  tags: '',
  featured: false,
  sortOrder: '0',
  seoTitle: '',
  seoDescription: '',
  galleryImages: [],
}

export const projectCategoryOptions: ProjectCategory[] = [
  'Сайт',
  'Web-приложение',
  'Автоматизация',
  'Игры',
  'Мобильное приложение',
  'ИИ-помощники',
  'Бот',
]

export const projectStatusOptions: Array<{
  value: ProjectStatus
  label: string
}> = [
  { value: 'published', label: 'Опубликован' },
  { value: 'draft', label: 'Черновик' },
  { value: 'archived', label: 'Скрыт / архив' },
]

export function slugifyTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'e')
    .replace(/[^a-z0-9а-я\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseListField(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function projectToFormValues(project: Project): ProjectFormValues {
  return {
    title: project.title,
    slug: project.slug,
    shortDescription: project.shortDescription,
    description: project.description,
    task: project.task ?? '',
    solution: project.solution ?? '',
    result: project.result ?? '',
    categories: project.categories.length > 0 ? [...project.categories] : ['Сайт'],
    year: String(project.year),
    eventDate: project.eventDate ?? '',
    status: project.status,
    coverImage: project.coverImage || project.cardImage || '',
    cardImage: '',
    demoUrl: project.demoUrl ?? '',
    websiteUrl: project.websiteUrl ?? '',
    githubUrl: project.githubUrl ?? '',
    technologies: project.technologies.join(', '),
    tags: project.tags.join(', '),
    featured: project.featured,
    sortOrder: String(project.sortOrder),
    seoTitle: project.seoTitle ?? '',
    seoDescription: project.seoDescription ?? '',
    galleryImages: project.galleryImages ?? [],
  }
}

export type ProjectFormErrors = Partial<Record<keyof ProjectFormValues, string>>

export function validateProjectForm(
  values: ProjectFormValues,
): ProjectFormErrors {
  const errors: ProjectFormErrors = {}

  if (!values.title.trim()) {
    errors.title = 'Укажите название'
  }
  if (!values.slug.trim()) {
    errors.slug = 'Укажите slug'
  }
  if (!values.shortDescription.trim()) {
    errors.shortDescription = 'Укажите краткое описание'
  }
  if (!values.description.trim()) {
    errors.description = 'Укажите описание'
  }
  if (values.categories.length === 0) {
    errors.categories = 'Выберите хотя бы одну категорию'
  }
  if (!values.year.trim() || Number.isNaN(Number(values.year))) {
    errors.year = 'Укажите корректный год'
  }

  return errors
}
