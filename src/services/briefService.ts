import type {
  BriefAnswer,
  BriefAnswerValue,
  BriefAnswersMap,
  BriefField,
  BriefFieldInput,
  BriefSubmission,
  PublicBriefPayload,
} from '../types/brief'
import type { Json } from '../types/database'
import { WEBSITE_BRIEF_TEMPLATE } from '../types/brief'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import { isValidFieldKey } from '../utils/fieldKey'
import { shouldMarkPersonalData } from '../utils/piiSanitizer'

interface BriefFieldRow {
  id: string
  project_id: string
  label: string
  field_key: string
  field_type: string
  placeholder: string | null
  help_text: string | null
  required: boolean
  is_personal_data?: boolean | null
  options: Json | null
  sort_order: number
  created_at: string
}

interface BriefSubmissionRow {
  id: string
  project_id: string
  status: string
  submitted_at: string | null
  created_at: string
  updated_at: string
}

interface BriefAnswerRow {
  id: string
  submission_id: string
  project_id: string
  field_key: string
  value: Json | null
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

function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseOptions(value: Json | null | unknown): string[] | null {
  if (!value) {
    return null
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean)
  }
  return null
}

function parseAnswerValue(value: Json | null): BriefAnswerValue {
  if (value === null || value === undefined) {
    return null
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item))
  }
  return JSON.stringify(value)
}

function mapField(row: BriefFieldRow): BriefField {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    fieldKey: row.field_key,
    fieldType: row.field_type,
    placeholder: row.placeholder,
    helpText: row.help_text,
    required: row.required,
    isPersonalData: Boolean(row.is_personal_data),
    options: parseOptions(row.options),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

function mapSubmission(row: BriefSubmissionRow): BriefSubmission {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAnswer(row: BriefAnswerRow): BriefAnswer {
  return {
    id: row.id,
    submissionId: row.submission_id,
    projectId: row.project_id,
    fieldKey: row.field_key,
    value: parseAnswerValue(row.value),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function friendlyPublicError(code?: string): string {
  switch (code) {
    case 'invalid_token':
      return 'Ссылка недействительна.'
    case 'already_submitted':
      return 'Бриф уже отправлен.'
    case 'validation_failed':
      return 'Заполните все обязательные поля.'
    default:
      return 'Не удалось сохранить. Попробуйте ещё раз.'
  }
}

function friendlyAdminError(message?: string | null): string {
  if (!message) {
    return 'Не удалось выполнить действие. Попробуйте ещё раз.'
  }
  const lower = message.toLowerCase()
  if (
    lower.includes('brief_fields') ||
    lower.includes('brief_submissions') ||
    lower.includes('brief_answers') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist') ||
    lower.includes('could not find the table')
  ) {
    return 'Таблицы брифа ещё не созданы. Выполните supabase/brief-module.sql в Supabase SQL Editor.'
  }
  if (lower.includes('is_personal_data')) {
    return 'Колонка is_personal_data ещё не создана. Выполните supabase/pii-classification.sql в SQL Editor.'
  }
  if (lower.includes('jwt') || lower.includes('not authenticated')) {
    return 'Сессия истекла. Войдите в админку снова.'
  }
  return message
}

async function markBriefPrepared(projectId: string): Promise<void> {
  const { client } = requireClient()
  if (!client) {
    return
  }
  await client
    .from('client_projects')
    .update({ status: 'Бриф подготовлен' })
    .eq('id', projectId)
    .eq('status', 'Новый')
}

export async function fetchBriefFields(
  projectId: string,
): Promise<{ data: BriefField[]; error: string | null }> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: [], error }
  }

  const { data, error: queryError } = await client
    .from('brief_fields')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (queryError) {
    return { data: [], error: friendlyAdminError(queryError.message) }
  }

  return {
    data: ((data ?? []) as BriefFieldRow[]).map(mapField),
    error: null,
  }
}

export async function createBriefField(
  projectId: string,
  input: BriefFieldInput,
): Promise<{ ok: boolean; data?: BriefField; error?: string }> {
  if (!input.label.trim()) {
    return { ok: false, error: 'Укажите заголовок вопроса' }
  }
  if (!isValidFieldKey(input.fieldKey)) {
    return {
      ok: false,
      error: 'Ключ: только латиница, цифры и underscore',
    }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { data, error: insertError } = await client
    .from('brief_fields')
    .insert({
      project_id: projectId,
      label: input.label.trim(),
      field_key: input.fieldKey.trim(),
      field_type: input.fieldType,
      placeholder: toNullable(input.placeholder),
      help_text: toNullable(input.helpText),
      required: input.required,
      is_personal_data: shouldMarkPersonalData(
        input.fieldKey,
        input.label,
        String(input.fieldType),
        input.isPersonalData,
      ),
      options: input.options.length > 0 ? input.options : null,
      sort_order: input.sortOrder,
    })
    .select('*')
    .single()

  if (insertError || !data) {
    if (insertError?.code === '23505') {
      return { ok: false, error: 'Такой field_key уже есть в проекте' }
    }
    return {
      ok: false,
      error: friendlyAdminError(
        insertError?.message ?? 'Не удалось добавить вопрос',
      ),
    }
  }

  await markBriefPrepared(projectId)

  return { ok: true, data: mapField(data as BriefFieldRow) }
}

export async function updateBriefField(
  fieldId: string,
  input: BriefFieldInput,
): Promise<{ ok: boolean; data?: BriefField; error?: string }> {
  if (!input.label.trim()) {
    return { ok: false, error: 'Укажите заголовок вопроса' }
  }
  if (!isValidFieldKey(input.fieldKey)) {
    return {
      ok: false,
      error: 'Ключ: только латиница, цифры и underscore',
    }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { data, error: updateError } = await client
    .from('brief_fields')
    .update({
      label: input.label.trim(),
      field_key: input.fieldKey.trim(),
      field_type: input.fieldType,
      placeholder: toNullable(input.placeholder),
      help_text: toNullable(input.helpText),
      required: input.required,
      is_personal_data: shouldMarkPersonalData(
        input.fieldKey,
        input.label,
        String(input.fieldType),
        input.isPersonalData,
      ),
      options: input.options.length > 0 ? input.options : null,
      sort_order: input.sortOrder,
    })
    .eq('id', fieldId)
    .select('*')
    .single()

  if (updateError || !data) {
    if (updateError?.code === '23505') {
      return { ok: false, error: 'Такой field_key уже есть в проекте' }
    }
    return {
      ok: false,
      error: friendlyAdminError(
        updateError?.message ?? 'Не удалось обновить вопрос',
      ),
    }
  }

  return { ok: true, data: mapField(data as BriefFieldRow) }
}

export async function deleteBriefField(
  fieldId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const { error: deleteError } = await client
    .from('brief_fields')
    .delete()
    .eq('id', fieldId)

  if (deleteError) {
    return { ok: false, error: friendlyAdminError(deleteError.message) }
  }

  return { ok: true }
}

export async function reorderBriefFields(
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, error: error ?? undefined }
  }

  const updates = orderedIds.map((id, index) =>
    client.from('brief_fields').update({ sort_order: index }).eq('id', id),
  )

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    return { ok: false, error: friendlyAdminError(failed.error.message) }
  }

  return { ok: true }
}

export async function applyWebsiteBriefTemplate(
  projectId: string,
  existingKeys: string[],
): Promise<{ ok: boolean; added: number; error?: string }> {
  const used = new Set(existingKeys)
  const toCreate = WEBSITE_BRIEF_TEMPLATE.filter(
    (item) => !used.has(item.fieldKey),
  )

  if (toCreate.length === 0) {
    return { ok: true, added: 0 }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, added: 0, error: error ?? undefined }
  }

  const startOrder = existingKeys.length
  const rows = toCreate.map((item, index) => ({
    project_id: projectId,
    label: item.label,
    field_key: item.fieldKey,
    field_type: item.fieldType,
    placeholder: item.placeholder ?? null,
    help_text: item.helpText ?? null,
    required: Boolean(item.required),
    is_personal_data: shouldMarkPersonalData(
      item.fieldKey,
      item.label,
      item.fieldType,
      false,
    ),
    options: item.options ?? null,
    sort_order: startOrder + index,
  }))

  const { error: insertError } = await client.from('brief_fields').insert(rows)
  if (insertError) {
    return {
      ok: false,
      added: 0,
      error: friendlyAdminError(insertError.message),
    }
  }

  await client
    .from('client_projects')
    .update({ status: 'Бриф подготовлен' })
    .eq('id', projectId)
    .eq('status', 'Новый')

  return { ok: true, added: toCreate.length }
}

export async function appendBriefFields(
  projectId: string,
  fields: BriefFieldInput[],
): Promise<{ ok: boolean; added: number; error?: string }> {
  if (fields.length === 0) {
    return { ok: false, added: 0, error: 'Нет вопросов для сохранения' }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, added: 0, error: error ?? undefined }
  }

  const existing = await fetchBriefFields(projectId)
  if (existing.error) {
    return { ok: false, added: 0, error: existing.error }
  }

  const usedKeys = existing.data.map((field) => field.fieldKey)
  const startOrder = existing.data.length
  const rows = []

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (!field.label.trim() || !isValidFieldKey(field.fieldKey)) {
      continue
    }
    let key = field.fieldKey
    if (usedKeys.includes(key)) {
      let n = 2
      while (usedKeys.includes(`${field.fieldKey}_${n}`)) {
        n += 1
      }
      key = `${field.fieldKey}_${n}`
    }
    usedKeys.push(key)
    rows.push({
      project_id: projectId,
      label: field.label.trim(),
      field_key: key,
      field_type: field.fieldType,
      placeholder: toNullable(field.placeholder),
      help_text: toNullable(field.helpText),
      required: field.required,
      is_personal_data: shouldMarkPersonalData(
        key,
        field.label,
        String(field.fieldType),
        field.isPersonalData,
      ),
      options: field.options.length > 0 ? field.options : null,
      sort_order: startOrder + rows.length,
    })
  }

  if (rows.length === 0) {
    return { ok: false, added: 0, error: 'Нет валидных вопросов для сохранения' }
  }

  const { error: insertError } = await client.from('brief_fields').insert(rows)
  if (insertError) {
    return {
      ok: false,
      added: 0,
      error: friendlyAdminError(insertError.message),
    }
  }

  await markBriefPrepared(projectId)
  return { ok: true, added: rows.length }
}

export async function replaceBriefFields(
  projectId: string,
  fields: BriefFieldInput[],
): Promise<{ ok: boolean; added: number; error?: string }> {
  if (fields.length === 0) {
    return { ok: false, added: 0, error: 'Нет вопросов для сохранения' }
  }

  const { client, error } = requireClient()
  if (!client) {
    return { ok: false, added: 0, error: error ?? undefined }
  }

  const { error: deleteError } = await client
    .from('brief_fields')
    .delete()
    .eq('project_id', projectId)

  if (deleteError) {
    return {
      ok: false,
      added: 0,
      error: friendlyAdminError(deleteError.message),
    }
  }

  const usedKeys: string[] = []
  const rows = []

  for (const field of fields) {
    if (!field.label.trim() || !isValidFieldKey(field.fieldKey)) {
      continue
    }
    let key = field.fieldKey
    if (usedKeys.includes(key)) {
      let n = 2
      while (usedKeys.includes(`${field.fieldKey}_${n}`)) {
        n += 1
      }
      key = `${field.fieldKey}_${n}`
    }
    usedKeys.push(key)
    rows.push({
      project_id: projectId,
      label: field.label.trim(),
      field_key: key,
      field_type: field.fieldType,
      placeholder: toNullable(field.placeholder),
      help_text: toNullable(field.helpText),
      required: field.required,
      is_personal_data: shouldMarkPersonalData(
        key,
        field.label,
        String(field.fieldType),
        field.isPersonalData,
      ),
      options: field.options.length > 0 ? field.options : null,
      sort_order: rows.length,
    })
  }

  if (rows.length === 0) {
    return { ok: false, added: 0, error: 'Нет валидных вопросов для сохранения' }
  }

  const { error: insertError } = await client.from('brief_fields').insert(rows)
  if (insertError) {
    return {
      ok: false,
      added: 0,
      error: friendlyAdminError(insertError.message),
    }
  }

  await markBriefPrepared(projectId)
  return { ok: true, added: rows.length }
}

export async function fetchLatestBriefSubmission(
  projectId: string,
): Promise<{
  data: BriefSubmission | null
  answers: BriefAnswer[]
  error: string | null
}> {
  const { client, error } = requireClient()
  if (!client) {
    return { data: null, answers: [], error }
  }

  const { data: submissions, error: submissionError } = await client
    .from('brief_submissions')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })

  if (submissionError) {
    return {
      data: null,
      answers: [],
      error: friendlyAdminError(submissionError.message),
    }
  }

  const rows = (submissions ?? []) as BriefSubmissionRow[]
  const submission =
    rows.find((row) => row.status === 'submitted') ?? rows[0] ?? null

  if (!submission) {
    return { data: null, answers: [], error: null }
  }

  const { data: answers, error: answersError } = await client
    .from('brief_answers')
    .select('*')
    .eq('submission_id', submission.id)

  if (answersError) {
    return {
      data: mapSubmission(submission),
      answers: [],
      error: friendlyAdminError(answersError.message),
    }
  }

  return {
    data: mapSubmission(submission),
    answers: ((answers ?? []) as BriefAnswerRow[]).map(mapAnswer),
    error: null,
  }
}

export function answersToMap(answers: BriefAnswer[]): BriefAnswersMap {
  const map: BriefAnswersMap = {}
  for (const answer of answers) {
    map[answer.fieldKey] = answer.value
  }
  return map
}

export async function fetchPublicBrief(
  token: string,
): Promise<{ data: PublicBriefPayload | null; error: string | null }> {
  const { client } = requireClient()
  if (!client) {
    return { data: null, error: 'Сервис временно недоступен.' }
  }

  const { data, error: rpcError } = await client.rpc('get_public_brief', {
    p_token: token,
  })

  if (rpcError) {
    return { data: null, error: 'Не удалось загрузить бриф. Попробуйте ещё раз.' }
  }

  const payload = data as PublicBriefPayload
  if (!payload?.ok) {
    return {
      data: payload ?? null,
      error: friendlyPublicError(payload?.error),
    }
  }

  return { data: payload, error: null }
}

export async function savePublicBriefDraft(
  token: string,
  answers: BriefAnswersMap,
): Promise<{ ok: boolean; error?: string }> {
  const { client } = requireClient()
  if (!client) {
    return { ok: false, error: 'Сервис временно недоступен.' }
  }

  const { data, error: rpcError } = await client.rpc('save_public_brief_draft', {
    p_token: token,
    p_answers: answers,
  })

  if (rpcError) {
    return { ok: false, error: 'Не удалось сохранить. Попробуйте ещё раз.' }
  }

  const payload = data as PublicBriefPayload
  if (!payload?.ok) {
    return { ok: false, error: friendlyPublicError(payload?.error) }
  }

  return { ok: true }
}

export async function submitPublicBrief(
  token: string,
  answers: BriefAnswersMap,
): Promise<{ ok: boolean; error?: string; missing?: string[] }> {
  const { client } = requireClient()
  if (!client) {
    return { ok: false, error: 'Сервис временно недоступен.' }
  }

  const { data, error: rpcError } = await client.rpc('submit_public_brief', {
    p_token: token,
    p_answers: answers,
  })

  if (rpcError) {
    return { ok: false, error: 'Не удалось сохранить. Попробуйте ещё раз.' }
  }

  const payload = data as PublicBriefPayload
  if (!payload?.ok) {
    return {
      ok: false,
      error: friendlyPublicError(payload?.error),
      missing: payload?.missing,
    }
  }

  return { ok: true }
}
