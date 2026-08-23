import type { SupabaseClient } from '@supabase/supabase-js'
import type { Project, ProjectGalleryImage } from '../types'
import type { ProjectFormValues } from '../types/projectForm'
import { parseListField } from '../types/projectForm'
import type { ProjectRow } from '../types/database'
import { fetchAdminProjects } from './adminService'
import {
  mapProjectRow,
  serializeProjectCategories,
} from './projectMappers'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import { deleteProjectImagesFolder } from './storageService'

export interface MutationResult<T = Project> {
  ok: boolean
  data?: T
  error?: string
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

function requireClient() {
  const client = getSupabaseClient()
  if (!client || !isSupabaseConfigured()) {
    return {
      client: null as null,
      error: 'Supabase не настроен. Добавьте ключи в .env.',
    }
  }
  return { client, error: null }
}

function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function formToPayload(values: ProjectFormValues, publishedAt?: string | null) {
  const year = Number(values.year)
  const sortOrder = Number(values.sortOrder || 0)
  const status = values.status

  return {
    title: values.title.trim(),
    slug: values.slug.trim(),
    short_description: values.shortDescription.trim(),
    description: values.description.trim(),
    task: toNullable(values.task),
    solution: toNullable(values.solution),
    result: toNullable(values.result),
    category: serializeProjectCategories(values.categories),
    subcategory: '',
    status,
    year,
    event_date: toNullable(values.eventDate),
    cover_image: toNullable(values.coverImage),
    // Одно изображение для карточки и страницы проекта
    card_image: toNullable(values.coverImage),
    demo_url: toNullable(values.demoUrl),
    website_url: toNullable(values.websiteUrl),
    github_url: toNullable(values.githubUrl),
    technologies: parseListField(values.technologies),
    tags: parseListField(values.tags),
    featured: values.featured,
    sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
    seo_title: toNullable(values.seoTitle),
    seo_description: toNullable(values.seoDescription),
    published_at:
      status === 'published'
        ? (publishedAt ?? new Date().toISOString())
        : null,
  }
}

async function syncProjectGallery(
  client: SupabaseClient,
  projectId: string,
  images: ProjectGalleryImage[],
): Promise<void> {
  const { data: existing, error: existingError } = await client
    .from('project_images')
    .select('id')
    .eq('project_id', projectId)

  if (existingError) {
    throw existingError
  }

  const keepIds = new Set(
    images.map((image) => image.id).filter((id): id is string => Boolean(id)),
  )
  const toDelete = ((existing ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => !keepIds.has(id))

  if (toDelete.length > 0) {
    const { error: deleteError } = await client
      .from('project_images')
      .delete()
      .in('id', toDelete)
    if (deleteError) {
      throw deleteError
    }
  }

  for (const [index, image] of images.entries()) {
    const sortOrder = index + 1
    if (image.id) {
      const { error } = await client
        .from('project_images')
        .update({
          image_url: image.url,
          alt: image.alt,
          sort_order: sortOrder,
        })
        .eq('id', image.id)
      if (error) {
        throw error
      }
      continue
    }

    const { error } = await client.from('project_images').insert({
      project_id: projectId,
      image_url: image.url,
      alt: image.alt,
      sort_order: sortOrder,
    })
    if (error) {
      throw error
    }
  }
}

async function fetchMappedProject(
  client: SupabaseClient,
  id: string,
): Promise<Project> {
  const { data, error } = await client
    .from('projects')
    .select(projectSelect)
    .eq('id', id)
    .single()

  if (error) {
    throw error
  }

  return mapProjectRow(data as unknown as ProjectRow)
}

export async function fetchAdminProjectById(
  id: string,
): Promise<{ data: Project | null; error: string | null }> {
  const { client, error: configError } = requireClient()
  if (!client) {
    const local = await fetchAdminProjects()
    const found = local.data.find((item) => item.id === id) ?? null
    return { data: found, error: configError }
  }

  try {
    const project = await fetchMappedProject(client, id)
    return { data: project, error: null }
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить проект',
    }
  }
}

export async function createAdminProject(
  values: ProjectFormValues,
): Promise<MutationResult> {
  const { client, error: configError } = requireClient()
  if (!client) {
    return { ok: false, error: configError ?? 'Ошибка сохранения' }
  }

  try {
    const payload = formToPayload(values)
    const { data, error } = await client
      .from('projects')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      throw error
    }

    const projectId = (data as { id: string }).id
    await syncProjectGallery(client, projectId, values.galleryImages)
    const project = await fetchMappedProject(client, projectId)
    return { ok: true, data: project }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Ошибка сохранения',
    }
  }
}

export async function updateAdminProject(
  id: string,
  values: ProjectFormValues,
): Promise<MutationResult> {
  const { client, error: configError } = requireClient()
  if (!client) {
    return { ok: false, error: configError ?? 'Ошибка сохранения' }
  }

  try {
    const { data: existing, error: existingError } = await client
      .from('projects')
      .select('published_at')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    const existingPublishedAt =
      (existing as { published_at: string | null } | null)?.published_at ?? null

    const payload = formToPayload(
      values,
      values.status === 'published' ? existingPublishedAt : null,
    )
    const { error } = await client.from('projects').update(payload).eq('id', id)

    if (error) {
      throw error
    }

    await syncProjectGallery(client, id, values.galleryImages)
    const project = await fetchMappedProject(client, id)
    return { ok: true, data: project }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Ошибка сохранения',
    }
  }
}

export async function hideAdminProject(id: string): Promise<MutationResult> {
  const { client, error: configError } = requireClient()
  if (!client) {
    return { ok: false, error: configError ?? 'Ошибка сохранения' }
  }

  try {
    const { error } = await client
      .from('projects')
      .update({ status: 'draft', published_at: null })
      .eq('id', id)

    if (error) {
      throw error
    }

    const project = await fetchMappedProject(client, id)
    return { ok: true, data: project }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Ошибка сохранения',
    }
  }
}

export async function deleteAdminProject(
  id: string,
): Promise<MutationResult<null>> {
  const { client, error: configError } = requireClient()
  if (!client) {
    return { ok: false, error: configError ?? 'Ошибка сохранения' }
  }

  try {
    await deleteProjectImagesFolder(id)
    const { error } = await client.from('projects').delete().eq('id', id)
    if (error) {
      throw error
    }
    return { ok: true, data: null }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Ошибка сохранения',
    }
  }
}

export async function duplicateAdminProject(
  project: Project,
): Promise<MutationResult> {
  const values: ProjectFormValues = {
    title: `${project.title} (копия)`,
    slug: `${project.slug}-copy-${Date.now().toString().slice(-5)}`,
    shortDescription: project.shortDescription,
    description: project.description,
    task: project.task ?? '',
    solution: project.solution ?? '',
    result: project.result ?? '',
    categories: project.categories.length > 0 ? [...project.categories] : ['Сайт'],
    year: String(project.year),
    eventDate: project.eventDate ?? '',
    status: 'draft',
    coverImage: project.coverImage || project.cardImage || '',
    cardImage: '',
    demoUrl: project.demoUrl ?? '',
    websiteUrl: project.websiteUrl ?? '',
    githubUrl: project.githubUrl ?? '',
    technologies: project.technologies.join(', '),
    tags: project.tags.join(', '),
    featured: false,
    sortOrder: String(project.sortOrder),
    seoTitle: project.seoTitle ?? '',
    seoDescription: project.seoDescription ?? '',
    galleryImages: (project.galleryImages ?? []).map((image, index) => ({
      id: null,
      url: image.url,
      alt: image.alt,
      sortOrder: index + 1,
    })),
  }

  return createAdminProject(values)
}
