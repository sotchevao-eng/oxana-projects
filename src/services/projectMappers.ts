import type { Project, ProjectCategory, ProjectStatus } from '../types'
import type { ProjectRow } from '../types/database'

const categories: ProjectCategory[] = [
  'Сайт',
  'Web-приложение',
  'Автоматизация',
  'Игры',
  'Мобильное приложение',
  'ИИ-помощники',
  'Бот',
]

function mapCategory(value: string): ProjectCategory {
  if (value === 'Дизайн') {
    return 'Игры'
  }
  return categories.includes(value as ProjectCategory)
    ? (value as ProjectCategory)
    : 'Сайт'
}

export function parseProjectCategories(value: string | null | undefined): ProjectCategory[] {
  if (!value?.trim()) {
    return ['Сайт']
  }

  const trimmed = value.trim()

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const mapped = parsed
          .filter((item): item is string => typeof item === 'string')
          .map(mapCategory)
        if (mapped.length > 0) {
          return [...new Set(mapped)]
        }
      }
    } catch {
      // fall through to single value
    }
  }

  return [mapCategory(trimmed)]
}

export function serializeProjectCategories(values: ProjectCategory[]): string {
  const unique = [...new Set(values)]
  if (unique.length <= 1) {
    return unique[0] ?? 'Сайт'
  }
  return JSON.stringify(unique)
}

export function getPrimaryCategory(project: Pick<Project, 'categories'>): ProjectCategory {
  return project.categories[0] ?? 'Сайт'
}

export function formatProjectCategories(project: Pick<Project, 'categories'>): string {
  return project.categories.join(' · ')
}

export function projectHasCategory(
  project: Pick<Project, 'categories'>,
  category: ProjectCategory,
): boolean {
  return project.categories.includes(category)
}

function mapStatus(value: string): ProjectStatus {
  if (value === 'draft' || value === 'archived' || value === 'published') {
    return value
  }
  return 'published'
}

export function mapProjectRow(row: ProjectRow): Project {
  const images = [...(row.project_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  )

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    shortDescription: row.short_description,
    description: row.description,
    task: row.task ?? null,
    solution: row.solution ?? null,
    result: row.result ?? null,
    categories: parseProjectCategories(row.category),
    status: mapStatus(row.status),
    year: row.year,
    eventDate: row.event_date,
    coverImage: row.cover_image,
    cardImage: row.card_image,
    gallery: images.map((image) => image.image_url),
    galleryImages: images.map((image) => ({
      id: image.id,
      url: image.image_url,
      alt: image.alt,
      sortOrder: image.sort_order,
    })),
    demoUrl: row.demo_url,
    websiteUrl: row.website_url,
    githubUrl: row.github_url,
    technologies: row.technologies ?? [],
    tags: row.tags ?? [],
    responsive: true,
    featured: row.featured,
    sortOrder: row.sort_order,
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  }
}
