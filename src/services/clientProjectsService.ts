import {
  CLIENT_PROJECT_STATUSES,
  CLIENT_PROJECT_TYPES,
  type ClientProjectStatus,
} from '../data/clientProjects'
import type {
  Client,
  ClientProject,
  ClientProjectFormValues,
  ClientProjectListItem,
} from '../types/clientProject'
import type { ClientProjectRow } from '../types/database'
import { mapClientProjectRow } from './clientProjectMappers'
import { createClient } from './clientsService'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import { createPublicToken } from '../utils/publicTokens'

export interface ClientProjectMutationResult {
  ok: boolean
  data?: ClientProject
  error?: string
}

const projectSelect = `
  *,
  clients (
    id,
    name,
    company,
    email,
    phone,
    messenger,
    notes,
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

function mapListItem(row: ClientProjectRow): ClientProjectListItem | null {
  const mapped = mapClientProjectRow(row)
  if (!mapped.client) {
    return null
  }
  return { ...mapped, client: mapped.client }
}

export async function fetchClientProjects(): Promise<{
  data: ClientProjectListItem[]
  error: string | null
}> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: [], error }
  }

  const { data, error: queryError } = await client
    .from('client_projects')
    .select(projectSelect)
    .order('created_at', { ascending: false })

  if (queryError) {
    return { data: [], error: queryError.message }
  }

  const items = ((data ?? []) as ClientProjectRow[])
    .map(mapListItem)
    .filter((item): item is ClientProjectListItem => Boolean(item))

  return { data: items, error: null }
}

export async function fetchClientProjectById(
  id: string,
): Promise<{ data: ClientProject | null; error: string | null }> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: null, error }
  }

  const { data, error: queryError } = await client
    .from('client_projects')
    .select(projectSelect)
    .eq('id', id)
    .maybeSingle()

  if (queryError) {
    return { data: null, error: queryError.message }
  }

  return {
    data: data ? mapClientProjectRow(data as ClientProjectRow) : null,
    error: null,
  }
}

export async function fetchProjectsByClientId(
  clientId: string,
): Promise<{ data: ClientProject[]; error: string | null }> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: [], error }
  }

  const { data, error: queryError } = await client
    .from('client_projects')
    .select(projectSelect)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (queryError) {
    return { data: [], error: queryError.message }
  }

  return {
    data: ((data ?? []) as ClientProjectRow[]).map((row) =>
      mapClientProjectRow(row),
    ),
    error: null,
  }
}

export function validateClientProjectForm(
  values: ClientProjectFormValues,
): string | null {
  if (values.clientMode === 'existing' && !values.clientId) {
    return 'Выберите клиента'
  }
  if (values.clientMode === 'new' && !values.client.name.trim()) {
    return 'Укажите имя клиента'
  }
  if (!values.title.trim()) {
    return 'Укажите название проекта'
  }
  if (!values.projectType.trim()) {
    return 'Укажите тип проекта'
  }
  return null
}

export async function createClientProject(
  values: ClientProjectFormValues,
): Promise<ClientProjectMutationResult> {
  const validationError = validateClientProjectForm(values)
  if (validationError) {
    return { ok: false, error: validationError }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  let clientId = values.clientId
  let createdClient: Client | undefined

  if (values.clientMode === 'new') {
    const clientResult = await createClient(values.client)
    if (!clientResult.ok || !clientResult.data) {
      return {
        ok: false,
        error: clientResult.error ?? 'Не удалось создать клиента',
      }
    }
    clientId = clientResult.data.id
    createdClient = clientResult.data
  }

  const briefToken = createPublicToken()
  const proposalToken = createPublicToken()

  const { data, error: insertError } = await client
    .from('client_projects')
    .insert({
      client_id: clientId,
      title: values.title.trim(),
      project_type: values.projectType.trim(),
      description: toNullable(values.description),
      task: toNullable(values.task),
      notes: toNullable(values.notes),
      budget: toNullable(values.budget),
      deadline: toNullable(values.deadline),
      status: values.status.trim() || 'Новый',
      brief_token: briefToken,
      proposal_token: proposalToken,
    })
    .select(projectSelect)
    .single()

  if (insertError || !data) {
    return {
      ok: false,
      error: insertError?.message ?? 'Не удалось создать проект',
    }
  }

  const mapped = mapClientProjectRow(data as ClientProjectRow, createdClient)
  return { ok: true, data: mapped }
}

export async function updateClientProject(
  id: string,
  values: Pick<
    ClientProjectFormValues,
    | 'title'
    | 'projectType'
    | 'description'
    | 'task'
    | 'notes'
    | 'budget'
    | 'deadline'
    | 'status'
  >,
): Promise<ClientProjectMutationResult> {
  if (!values.title.trim()) {
    return { ok: false, error: 'Укажите название проекта' }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { data, error: updateError } = await client
    .from('client_projects')
    .update({
      title: values.title.trim(),
      project_type: values.projectType.trim(),
      description: toNullable(values.description),
      task: toNullable(values.task),
      notes: toNullable(values.notes),
      budget: toNullable(values.budget),
      deadline: toNullable(values.deadline),
      status: values.status.trim() || 'Новый',
    })
    .eq('id', id)
    .select(projectSelect)
    .single()

  if (updateError || !data) {
    return {
      ok: false,
      error: updateError?.message ?? 'Не удалось обновить проект',
    }
  }

  return { ok: true, data: mapClientProjectRow(data as ClientProjectRow) }
}

export function matchesClientProjectSearch(
  item: ClientProjectListItem,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) {
    return true
  }

  const haystack = [
    item.client.name,
    item.client.company,
    item.client.email,
    item.client.phone,
    item.client.messenger,
    item.title,
    item.projectType,
    item.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(q)
}

export function matchesClientProjectFilters(
  item: ClientProjectListItem,
  status: string,
  projectType: string,
): boolean {
  if (status !== 'all' && item.status !== status) {
    return false
  }
  if (projectType !== 'all' && item.projectType !== projectType) {
    return false
  }
  return true
}

export function getClientProjectStatusLabel(status: string): string {
  return status
}

export const clientProjectStatusOptions = CLIENT_PROJECT_STATUSES
export const clientProjectTypeOptions = CLIENT_PROJECT_TYPES

export function isWaitingBriefStatus(status: string): boolean {
  const waiting: ClientProjectStatus[] = [
    'Новый',
    'Бриф подготовлен',
    'Бриф отправлен',
  ]
  return waiting.includes(status as ClientProjectStatus)
}
