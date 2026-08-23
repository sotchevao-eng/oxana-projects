import type { ContactRow, ContactRowStatus } from '../types/database'
import type { Project } from '../types'
import { getLocalContactRequests } from './contactService'
import { mapProjectRow } from './projectMappers'
import type { ProjectRow } from '../types/database'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import { projects as localProjects } from '../data/projects'

export interface AdminContact {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  projectType: string | null
  message: string
  status: ContactRowStatus | 'local'
  createdAt: string
}

export interface DashboardStats {
  totalProjects: number
  publishedProjects: number
  draftProjects: number
  featuredProjects: number
  totalContacts: number
  newContacts: number
}

export interface DashboardData {
  stats: DashboardStats
  recentProjects: Project[]
  recentContacts: AdminContact[]
  error: string | null
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

function mapContactRow(row: ContactRow): AdminContact {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    projectType: row.project_type,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  }
}

function getLocalAdminContacts(): AdminContact[] {
  return getLocalContactRequests().map((item) => ({
    id: item.id,
    name: item.name,
    company: item.company || null,
    email: item.email || null,
    phone: item.phoneOrTelegram || null,
    projectType: item.projectType || null,
    message: item.description,
    status: 'local',
    createdAt: item.createdAt,
  }))
}

function normalizeLocalProject(project: Project): Project {
  return {
    ...project,
    galleryImages:
      project.galleryImages ??
      project.gallery.map((url, index) => ({
        id: null,
        url,
        alt: null,
        sortOrder: index + 1,
      })),
  }
}

function sortProjectsByDate(items: Project[]): Project[] {
  return [...items]
    .map(normalizeLocalProject)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
}

function sortContactsByDate(items: AdminContact[]): AdminContact[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export async function fetchAdminProjects(): Promise<{
  data: Project[]
  error: string | null
}> {
  const client = getSupabaseClient()

  if (!client || !isSupabaseConfigured()) {
    return { data: sortProjectsByDate(localProjects), error: null }
  }

  try {
    const { data, error } = await client
      .from('projects')
      .select(projectSelect)
      .order('updated_at', { ascending: false })

    if (error) {
      throw error
    }

    const mapped = ((data ?? []) as unknown as ProjectRow[]).map(mapProjectRow)
    return { data: sortProjectsByDate(mapped), error: null }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Не удалось загрузить проекты для админки'

    return {
      data: sortProjectsByDate(localProjects),
      error: message,
    }
  }
}

export async function fetchAdminContacts(): Promise<{
  data: AdminContact[]
  error: string | null
}> {
  const client = getSupabaseClient()

  if (!client || !isSupabaseConfigured()) {
    return { data: sortContactsByDate(getLocalAdminContacts()), error: null }
  }

  try {
    const { data, error } = await client
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const mapped = ((data ?? []) as ContactRow[]).map(mapContactRow)
    const remoteIds = new Set(mapped.map((item) => item.id))
    const localOnly = getLocalAdminContacts().filter(
      (item) => !remoteIds.has(item.id),
    )
    return {
      data: sortContactsByDate([...mapped, ...localOnly]),
      error: null,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Не удалось загрузить заявки для админки'

    return {
      data: sortContactsByDate(getLocalAdminContacts()),
      error: message,
    }
  }
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [projectsResult, contactsResult] = await Promise.all([
    fetchAdminProjects(),
    fetchAdminContacts(),
  ])

  const projects = projectsResult.data
  const contacts = contactsResult.data

  const stats: DashboardStats = {
    totalProjects: projects.length,
    publishedProjects: projects.filter((item) => item.status === 'published')
      .length,
    draftProjects: projects.filter((item) => item.status === 'draft').length,
    featuredProjects: projects.filter((item) => item.featured).length,
    totalContacts: contacts.length,
    newContacts: contacts.filter(
      (item) => item.status === 'new' || item.status === 'local',
    ).length,
  }

  return {
    stats,
    recentProjects: projects.slice(0, 5),
    recentContacts: contacts.slice(0, 5),
    error: projectsResult.error ?? contactsResult.error,
  }
}

export function formatAdminDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function getContactStatusLabel(status: AdminContact['status']): string {
  switch (status) {
    case 'new':
      return 'Новая'
    case 'in_progress':
      return 'В работе'
    case 'done':
      return 'Ответ отправлен'
    case 'archived':
      return 'Закрыта'
    case 'local':
      return 'Новая'
    default:
      return status
  }
}

export function formatAdminDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
