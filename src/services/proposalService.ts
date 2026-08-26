import type {
  Proposal,
  ProposalFeedbackItem,
  ProposalFormValues,
  ProposalSection,
  ProposalStatus,
  PublicProposalPayload,
} from '../types/proposal'
import type { ProposalAiDraft, ProposalAiStyle } from '../types/proposalAi'
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

function friendlyPublicProposalError(code?: string | null): string {
  switch (code) {
    case 'proposal_not_published':
      return 'Предложение пока не опубликовано.'
    case 'proposal_not_found':
      return 'Ссылка недействительна.'
    case 'proposal_already_accepted':
      return 'Предложение уже принято.'
    case 'validation_failed':
      return 'Проверьте имя и комментарий.'
    default:
      return 'Не удалось загрузить предложение.'
  }
}

function friendlyPublicActionError(code?: string | null): string {
  switch (code) {
    case 'proposal_not_published':
      return 'Предложение пока не опубликовано.'
    case 'proposal_not_found':
      return 'Ссылка недействительна.'
    case 'proposal_already_accepted':
      return 'Предложение уже принято.'
    case 'validation_failed':
      return 'Проверьте имя и комментарий.'
    default:
      return 'Не удалось отправить ответ. Попробуйте ещё раз.'
  }
}

interface ProposalFeedbackRow {
  id: string
  proposal_id: string
  action: string
  name: string | null
  comment: string | null
  created_at: string
}

function mapFeedback(row: ProposalFeedbackRow): ProposalFeedbackItem {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    action: row.action,
    name: row.name ?? '',
    comment: row.comment ?? '',
    createdAt: row.created_at,
  }
}

export async function fetchPublicProposal(
  token: string,
): Promise<{ data: PublicProposalPayload | null; error: string | null }> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: null, error: error ?? 'Сервис временно недоступен.' }
  }

  const { data, error: rpcError } = await client.rpc('get_public_proposal', {
    p_token: token,
  })

  if (rpcError) {
    const msg = rpcError.message?.toLowerCase() ?? ''
    if (
      msg.includes('get_public_proposal') ||
      msg.includes('could not find the function') ||
      msg.includes('schema cache')
    ) {
      return {
        data: null,
        error:
          'Публичный RPC КП ещё не создан. Выполните supabase/proposal-public-rpc.sql в Supabase SQL Editor.',
      }
    }
    return {
      data: null,
      error: 'Не удалось загрузить предложение. Попробуйте ещё раз.',
    }
  }

  const payload = data as PublicProposalPayload
  if (!payload?.ok) {
    return {
      data: payload ?? null,
      error: friendlyPublicProposalError(payload?.error),
    }
  }

  return { data: payload, error: null }
}

export async function acceptPublicProposal(
  token: string,
  name: string,
  comment: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? 'Сервис временно недоступен.' }
  }

  const { data, error: rpcError } = await client.rpc('accept_public_proposal', {
    p_token: token,
    p_name: name.trim(),
    p_comment: comment.trim() || null,
  })

  if (rpcError) {
    const msg = rpcError.message?.toLowerCase() ?? ''
    if (
      msg.includes('accept_public_proposal') ||
      msg.includes('could not find the function')
    ) {
      return {
        ok: false,
        error:
          'RPC принятия КП ещё не создан. Выполните supabase/proposal-feedback-rpc.sql.',
      }
    }
    return { ok: false, error: 'Не удалось принять предложение.' }
  }

  const payload = data as { ok?: boolean; status?: string; error?: string }
  if (!payload?.ok) {
    return {
      ok: false,
      error: friendlyPublicActionError(payload?.error),
    }
  }

  return { ok: true, status: payload.status ?? 'accepted' }
}

export async function requestPublicProposalChanges(
  token: string,
  name: string,
  comment: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? 'Сервис временно недоступен.' }
  }

  const { data, error: rpcError } = await client.rpc(
    'request_proposal_changes',
    {
      p_token: token,
      p_name: name.trim(),
      p_comment: comment.trim(),
    },
  )

  if (rpcError) {
    const msg = rpcError.message?.toLowerCase() ?? ''
    if (
      msg.includes('request_proposal_changes') ||
      msg.includes('could not find the function')
    ) {
      return {
        ok: false,
        error:
          'RPC запроса изменений ещё не создан. Выполните supabase/proposal-feedback-rpc.sql.',
      }
    }
    return { ok: false, error: 'Не удалось отправить запрос.' }
  }

  const payload = data as { ok?: boolean; status?: string; error?: string }
  if (!payload?.ok) {
    return {
      ok: false,
      error: friendlyPublicActionError(payload?.error),
    }
  }

  return { ok: true, status: payload.status ?? 'changes_requested' }
}

export async function fetchProposalFeedback(
  proposalId: string,
): Promise<{ data: ProposalFeedbackItem[]; error: string | null }> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: [], error }
  }

  const { data, error: queryError } = await client
    .from('proposal_feedback')
    .select('*')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: false })

  if (queryError) {
    return { data: [], error: friendlyError(queryError.message) }
  }

  return {
    data: ((data ?? []) as ProposalFeedbackRow[]).map(mapFeedback),
    error: null,
  }
}

export async function applyProposalAiDraft(
  projectId: string,
  draft: ProposalAiDraft,
  admin: { price: string; deadline: string },
): Promise<{ ok: boolean; data?: Proposal; error?: string }> {
  const values: ProposalFormValues = {
    title: draft.title.trim() || 'Коммерческое предложение',
    subtitle: draft.subtitle.trim(),
    intro: draft.intro.trim(),
    price: admin.price.trim(),
    deadline: admin.deadline.trim(),
    status: 'ready',
    sections: draft.sections.map((section, index) => ({
      sectionType: section.sectionType,
      title: section.title,
      content: section.content,
      sortOrder: index,
      visible: section.visible !== false,
    })),
  }

  const existing = await fetchProposalByProjectId(projectId)
  if (existing.error && !existing.data) {
    return { ok: false, error: existing.error }
  }

  if (existing.data) {
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
        status: 'ready',
        published: false,
      })
      .eq('id', existing.data.id)

    if (updateError) {
      return { ok: false, error: friendlyError(updateError.message) }
    }

    const synced = await syncSections(existing.data.id, values.sections)
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

  return createProposal(projectId, values)
}

export async function logProposalAiGeneration(params: {
  projectId: string
  proposalStyle: ProposalAiStyle
  hasPrice: boolean
  hasDeadline: boolean
  commentLength: number
  briefAnswersCount: number
  model?: string
  draft: ProposalAiDraft
}): Promise<void> {
  const { client } = requireClient()
  if (!client) {
    return
  }

  const {
    data: { user },
  } = await client.auth.getUser()

  await client.from('ai_generations').insert({
    project_id: params.projectId,
    generation_type: 'proposal',
    model: params.model ?? null,
    created_by: user?.id ?? null,
    input_json: {
      proposal_style: params.proposalStyle,
      has_price: params.hasPrice,
      has_deadline: params.hasDeadline,
      comment_length: params.commentLength,
      brief_answers_count: params.briefAnswersCount,
    },
    output_json: {
      title: params.draft.title,
      sections_count: params.draft.sections.length,
      section_types: params.draft.sections.map((s) => s.sectionType),
    },
  })
}
