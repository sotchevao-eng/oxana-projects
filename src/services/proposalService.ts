import type {
  Proposal,
  ProposalFormValues,
  ProposalSection,
  ProposalStatus,
} from '../types/proposal'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

interface ProposalRow {
  id: string
  project_id: string
  title: string | null
  subtitle: string | null
  intro: string | null
  price: string | null
  deadline: string | null
  status: string
  published: boolean
  accepted_at: string | null
  changes_requested_at: string | null
  created_at: string
  updated_at: string
}

interface ProposalSectionRow {
  id: string
  proposal_id: string
  section_type: string
  title: string | null
  content: string | null
  sort_order: number
  visible: boolean
  created_at: string
  updated_at: string
}

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

function friendlyError(message?: string | null): string {
  if (!message) {
    return 'Не удалось выполнить действие. Попробуйте ещё раз.'
  }
  const lower = message.toLowerCase()
  if (
    lower.includes('proposals') ||
    lower.includes('proposal_sections') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist') ||
    lower.includes('could not find the table')
  ) {
    return 'Таблицы КП ещё не созданы. Выполните supabase/proposals-module.sql в Supabase SQL Editor.'
  }
  return message
}

function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function mapSection(row: ProposalSectionRow): ProposalSection {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    sectionType: row.section_type,
    title: row.title ?? '',
    content: row.content ?? '',
    sortOrder: row.sort_order,
    visible: row.visible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProposal(
  row: ProposalRow,
  sections: ProposalSectionRow[] = [],
): Proposal {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title ?? '',
    subtitle: row.subtitle ?? '',
    intro: row.intro ?? '',
    price: row.price ?? '',
    deadline: row.deadline ?? '',
    status: row.status,
    published: row.published,
    acceptedAt: row.accepted_at,
    changesRequestedAt: row.changes_requested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sections: sections
      .map(mapSection)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }
}

export async function fetchProposalByProjectId(
  projectId: string,
): Promise<{ data: Proposal | null; error: string | null }> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: null, error }
  }

  const { data: proposal, error: proposalError } = await client
    .from('proposals')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()

  if (proposalError) {
    return { data: null, error: friendlyError(proposalError.message) }
  }

  if (!proposal) {
    return { data: null, error: null }
  }

  const row = proposal as ProposalRow
  const { data: sections, error: sectionsError } = await client
    .from('proposal_sections')
    .select('*')
    .eq('proposal_id', row.id)
    .order('sort_order', { ascending: true })

  if (sectionsError) {
    return {
      data: mapProposal(row, []),
      error: friendlyError(sectionsError.message),
    }
  }

  return {
    data: mapProposal(row, (sections ?? []) as ProposalSectionRow[]),
    error: null,
  }
}

async function syncSections(
  proposalId: string,
  sections: ProposalSection[],
): Promise<{ ok: boolean; error?: string }> {
  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { error: deleteError } = await client
    .from('proposal_sections')
    .delete()
    .eq('proposal_id', proposalId)

  if (deleteError) {
    return { ok: false, error: friendlyError(deleteError.message) }
  }

  if (sections.length === 0) {
    return { ok: true }
  }

  const rows = sections.map((section, index) => ({
    proposal_id: proposalId,
    section_type: section.sectionType,
    title: toNullable(section.title),
    content: toNullable(section.content),
    sort_order: index,
    visible: section.visible,
  }))

  const { error: insertError } = await client
    .from('proposal_sections')
    .insert(rows)

  if (insertError) {
    return { ok: false, error: friendlyError(insertError.message) }
  }

  return { ok: true }
}

export async function createProposal(
  projectId: string,
  values: ProposalFormValues,
): Promise<{ ok: boolean; data?: Proposal; error?: string }> {
  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { data, error: insertError } = await client
    .from('proposals')
    .insert({
      project_id: projectId,
      title: toNullable(values.title),
      subtitle: toNullable(values.subtitle),
      intro: toNullable(values.intro),
      price: toNullable(values.price),
      deadline: toNullable(values.deadline),
      status: values.status || 'draft',
      published: false,
    })
    .select('*')
    .single()

  if (insertError || !data) {
    if (insertError?.code === '23505') {
      return {
        ok: false,
        error: 'КП для этого проекта уже существует. Откройте его для редактирования.',
      }
    }
    return {
      ok: false,
      error: friendlyError(insertError?.message ?? 'Не удалось создать КП'),
    }
  }

  const row = data as ProposalRow
  const synced = await syncSections(row.id, values.sections)
  if (!synced.ok) {
    return { ok: false, error: synced.error }
  }

  const loaded = await fetchProposalByProjectId(projectId)
  return {
    ok: Boolean(loaded.data),
    data: loaded.data ?? undefined,
    error: loaded.error ?? undefined,
  }
}

export async function updateProposal(
  proposalId: string,
  projectId: string,
  values: ProposalFormValues,
): Promise<{ ok: boolean; data?: Proposal; error?: string }> {
  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { error: updateError } = await client
    .from('proposals')
    .update({
      title: toNullable(values.title),
      subtitle: toNullable(values.subtitle),
      intro: toNullable(values.intro),
      price: toNullable(values.price),
      deadline: toNullable(values.deadline),
      status: values.status || 'draft',
    })
    .eq('id', proposalId)

  if (updateError) {
    return { ok: false, error: friendlyError(updateError.message) }
  }

  const synced = await syncSections(proposalId, values.sections)
  if (!synced.ok) {
    return { ok: false, error: synced.error }
  }

  const loaded = await fetchProposalByProjectId(projectId)
  return {
    ok: Boolean(loaded.data),
    data: loaded.data ?? undefined,
    error: loaded.error ?? undefined,
  }
}

export async function setProposalPublished(
  proposalId: string,
  projectId: string,
  published: boolean,
): Promise<{ ok: boolean; data?: Proposal; error?: string }> {
  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const nextStatus: ProposalStatus = published ? 'published' : 'ready'

  const { error: updateError } = await client
    .from('proposals')
    .update({
      published,
      status: nextStatus,
    })
    .eq('id', proposalId)

  if (updateError) {
    return { ok: false, error: friendlyError(updateError.message) }
  }

  if (published) {
    await client
      .from('client_projects')
      .update({ status: 'КП отправлено' })
      .eq('id', projectId)
  }

  const loaded = await fetchProposalByProjectId(projectId)
  return {
    ok: Boolean(loaded.data),
    data: loaded.data ?? undefined,
    error: loaded.error ?? undefined,
  }
}

export function proposalToForm(proposal: Proposal): ProposalFormValues {
  return {
    title: proposal.title,
    subtitle: proposal.subtitle,
    intro: proposal.intro,
    price: proposal.price,
    deadline: proposal.deadline,
    status: proposal.status,
    sections: proposal.sections.map((section) => ({ ...section })),
  }
}
