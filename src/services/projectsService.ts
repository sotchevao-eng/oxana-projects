import { projects as localProjects } from '../data/projects'
import type { Project } from '../types'
import type { ProjectFilterId, ProjectSortId } from '../types/filters'
import type { ProjectRow } from '../types/database'
import {
  mapProjectRow,
  projectHasCategory,
} from './projectMappers'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

export {
  formatProjectCategories,
  getPrimaryCategory,
  projectHasCategory,
} from './projectMappers'

export interface ProjectsServiceResult {
  data: Project[]
  error: string | null
  source: 'supabase' | 'local'
}

export interface ProjectServiceResult {
  data: Project | null
  error: string | null
  source: 'supabase' | 'local'
}

function sortByOrder(items: Project[]): Project[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}

function getLocalProjects(): Project[] {
  return sortByOrder(
    localProjects.map((project) => ({
      ...project,
      galleryImages:
        project.galleryImages ??
        project.gallery.map((url, index) => ({
          id: null,
          url,
          alt: null,
          sortOrder: index + 1,
        })),
    })),
  )
}

const projectSelect = `
  *,
  project_images (
    id,
    project_id,
    image_url,
    alt,
    sort_order,
    created_at
  )
`

export async function fetchAllProjects(): Promise<ProjectsServiceResult> {
  const client = getSupabaseClient()

  if (!client || !isSupabaseConfigured()) {
    return {
      data: getLocalProjects(),
      error: null,
      source: 'local',
    }
  }

  try {
    const { data, error } = await client
      .from('projects')
      .select(projectSelect)
      .eq('status', 'published')
      .order('sort_order', { ascending: true })

    if (error) {
      throw error
    }

    const mapped = ((data ?? []) as unknown as ProjectRow[]).map(mapProjectRow)

    return {
      data: sortByOrder(mapped),
      error: null,
      source: 'supabase',
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Не удалось загрузить проекты из Supabase'

    return {
      data: getLocalProjects(),
      error: message,
      source: 'local',
    }
  }
}

export async function fetchFeaturedProjects(
  limit = 6,
): Promise<ProjectsServiceResult> {
  const result = await fetchAllProjects()
  return {
    ...result,
    data: result.data.filter((project) => project.featured).slice(0, limit),
  }
}

export async function fetchProjectBySlug(
  slug: string,
): Promise<ProjectServiceResult> {
  const client = getSupabaseClient()

  if (!client || !isSupabaseConfigured()) {
    const local = getLocalProjects().find((project) => project.slug === slug)
    return {
      data: local ?? null,
      error: null,
      source: 'local',
    }
  }

  try {
    const { data, error } = await client
      .from('projects')
      .select(projectSelect)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return {
        data: null,
        error: null,
        source: 'supabase',
      }
    }

    return {
      data: mapProjectRow(data as unknown as ProjectRow),
      error: null,
      source: 'supabase',
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Не удалось загрузить проект из Supabase'
    const local = getLocalProjects().find((project) => project.slug === slug)

    return {
      data: local ?? null,
      error: message,
      source: 'local',
    }
  }
}

export async function fetchRelatedProjects(
  slug: string,
  limit = 3,
): Promise<ProjectsServiceResult> {
  const result = await fetchAllProjects()
  return {
    ...result,
    data: result.data.filter((project) => project.slug !== slug).slice(0, limit),
  }
}

/** @deprecated use fetchAllProjects — sync local fallback for helpers */
export function getAllProjects(): Project[] {
  return getLocalProjects()
}

export function getFeaturedProjects(limit = 6): Project[] {
  return getLocalProjects()
    .filter((project) => project.featured)
    .slice(0, limit)
}

export function getProjectBySlug(slug: string): Project | undefined {
  return getLocalProjects().find((project) => project.slug === slug)
}

export function getRelatedProjects(slug: string, limit = 3): Project[] {
  return getLocalProjects()
    .filter((project) => project.slug !== slug)
    .slice(0, limit)
}

export function formatProjectDate(isoDate: string | null): string | null {
  if (!isoDate) {
    return null
  }

  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) {
    return isoDate
  }

  return `${day}.${month}.${year}`
}

export function hasProjectImage(src: string | null | undefined): src is string {
  return Boolean(src && src.trim().length > 0)
}

export function getProjectStatusLabel(status: Project['status']): string {
  switch (status) {
    case 'published':
      return 'Опубликован'
    case 'draft':
      return 'Черновик'
    case 'archived':
      return 'Архив'
    default:
      return status
  }
}

export function getProjectCaseSections(project: Project): {
  task: string
  solution: string
  result: string
} {
  return {
    task: project.task ?? project.shortDescription,
    solution: project.solution ?? project.description,
    result:
      project.result ??
      'Проект реализован как целостное цифровое решение. Детали результата будут дополнены на следующих этапах.',
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function matchesFilter(project: Project, filterId: ProjectFilterId): boolean {
  switch (filterId) {
    case 'all':
      return true
    case 'sites':
      return projectHasCategory(project, 'Сайт')
    case 'web-apps':
      return projectHasCategory(project, 'Web-приложение')
    case 'business':
      return (
        projectHasCategory(project, 'Автоматизация') ||
        project.tags.some(
          (tag) =>
            normalize(tag).includes('корпоратив') ||
            normalize(tag).includes('бухгалтер') ||
            normalize(tag).includes('бизнес') ||
            normalize(tag).includes('строительств') ||
            normalize(tag).includes('финанс'),
        )
      )
    case 'games':
      return (
        projectHasCategory(project, 'Игры') ||
        project.tags.some((tag) => normalize(tag).includes('игр'))
      )
    case 'mobile':
      return (
        projectHasCategory(project, 'Мобильное приложение') ||
        project.tags.some((tag) => normalize(tag).includes('мобильн'))
      )
    case 'ai-assistants':
      return (
        projectHasCategory(project, 'ИИ-помощники') ||
        project.tags.some(
          (tag) =>
            normalize(tag).includes('ии') ||
            normalize(tag).includes('ai') ||
            normalize(tag).includes('помощник') ||
            normalize(tag).includes('чат-бот') ||
            normalize(tag).includes('чатбот'),
        )
      )
    case 'bot':
      return (
        projectHasCategory(project, 'Бот') ||
        project.tags.some(
          (tag) =>
            normalize(tag) === 'бот' ||
            normalize(tag).includes('telegram') ||
            normalize(tag).includes('телеграм'),
        )
      )
    default:
      return true
  }
}

function matchesSearch(project: Project, query: string): boolean {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) {
    return true
  }

  const haystack = [
    project.title,
    project.shortDescription,
    project.description,
    ...project.categories,
    ...project.tags,
  ]
    .map(normalize)
    .join(' ')

  return haystack.includes(normalizedQuery)
}

function sortProjects(items: Project[], sortId: ProjectSortId): Project[] {
  const sorted = [...items]

  switch (sortId) {
    case 'newest':
      return sorted.sort((a, b) => {
        if (b.year !== a.year) {
          return b.year - a.year
        }
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      })
    case 'oldest':
      return sorted.sort((a, b) => {
        if (a.year !== b.year) {
          return a.year - b.year
        }
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      })
    case 'title':
      return sorted.sort((a, b) =>
        a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' }),
      )
    case 'featured':
      return sorted.sort((a, b) => {
        if (a.featured === b.featured) {
          return a.sortOrder - b.sortOrder
        }
        return a.featured ? -1 : 1
      })
    default:
      return sortByOrder(sorted)
  }
}

export interface ProjectCatalogQuery {
  filterId?: ProjectFilterId
  search?: string
  sortId?: ProjectSortId
  items?: Project[]
}

export function queryProjects({
  filterId = 'all',
  search = '',
  sortId = 'newest',
  items,
}: ProjectCatalogQuery = {}): Project[] {
  const source = items ?? getLocalProjects()
  const filtered = source.filter(
    (project) =>
      matchesFilter(project, filterId) && matchesSearch(project, search),
  )

  return sortProjects(filtered, sortId)
}
