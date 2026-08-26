import type { GenerateBriefRequest, GenerateBriefResponse } from '../types/briefAi'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import { friendlyAiError, validateBriefAiDraft } from '../utils/briefAiValidate'

function mapServerDraft(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return raw
  }
  const draft = raw as Record<string, unknown>
  const fields = Array.isArray(draft.fields)
    ? draft.fields.map((item) => {
        if (!item || typeof item !== 'object') return item
        const field = item as Record<string, unknown>
        return {
          label: field.label,
          fieldKey: field.fieldKey ?? field.field_key,
          fieldType: field.fieldType ?? field.field_type,
          placeholder: field.placeholder,
          helpText: field.helpText ?? field.help_text,
          required: field.required,
          options: field.options,
        }
      })
    : []

  return {
    title: draft.title,
    intro: draft.intro,
    fields,
  }
}

export async function generateBriefWithAi(
  request: GenerateBriefRequest,
  existingKeys: string[] = [],
): Promise<GenerateBriefResponse> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase не настроен.' }
  }

  const client = getSupabaseClient()
  if (!client) {
    return { ok: false, error: 'Supabase не настроен.' }
  }

  const { data, error } = await client.functions.invoke('generate-brief', {
    body: {
      projectId: request.projectId,
      projectType: request.projectType,
      description: request.description,
      task: request.task,
      aiComment: request.aiComment,
      questionsCount: request.questionsCount,
    },
  })

  if (error) {
    return { ok: false, error: friendlyAiError(error.message) }
  }

  const payload = (data ?? {}) as {
    ok?: boolean
    draft?: unknown
    error?: string
  }

  if (!payload.ok) {
    return { ok: false, error: friendlyAiError(payload.error) }
  }

  const validated = validateBriefAiDraft(
    mapServerDraft(payload.draft),
    existingKeys,
  )
  if (!validated.ok) {
    return { ok: false, error: validated.error }
  }

  return { ok: true, draft: validated.draft }
}
