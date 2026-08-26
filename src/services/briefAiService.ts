import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import type {
  GenerateBriefErrorDetails,
  GenerateBriefRequest,
  GenerateBriefResponse,
} from '../types/briefAi'
import {
  friendlyAiError,
  sanitizeAiDebugText,
  validateBriefAiDraft,
} from '../utils/briefAiValidate'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

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
          isPersonalData: field.isPersonalData ?? field.is_personal_data,
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

function extractAppErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const record = payload as Record<string, unknown>
  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error.trim()
  }
  if (typeof record.msg === 'string' && record.msg.trim()) {
    return record.msg.trim()
  }
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim()
  }
  return undefined
}

async function readHttpErrorDetails(
  error: FunctionsHttpError,
): Promise<GenerateBriefErrorDetails> {
  const response = error.context as Response
  const status =
    response && typeof response.status === 'number' ? response.status : undefined

  let bodyText = ''
  try {
    if (response && typeof response.text === 'function') {
      bodyText = await response.text()
    }
  } catch {
    bodyText = ''
  }

  let parsed: unknown = null
  if (bodyText) {
    try {
      parsed = JSON.parse(bodyText)
    } catch {
      parsed = null
    }
  }

  const appCode = extractAppErrorCode(parsed)
  return {
    type: 'FunctionsHttpError',
    status,
    message: appCode || error.message,
    body: bodyText ? sanitizeAiDebugText(bodyText) : undefined,
  }
}

function detailsFromUnknown(error: unknown): GenerateBriefErrorDetails {
  if (error instanceof FunctionsFetchError) {
    return {
      type: 'FunctionsFetchError',
      message: error.message,
    }
  }
  if (error instanceof FunctionsRelayError) {
    return {
      type: 'FunctionsRelayError',
      message: error.message,
    }
  }
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      message: error.message,
    }
  }
  return {
    type: 'UnknownError',
    message: 'Неизвестная ошибка вызова Edge Function',
  }
}

export async function generateBriefWithAi(
  request: GenerateBriefRequest,
  existingKeys: string[] = [],
): Promise<GenerateBriefResponse> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Supabase не настроен.',
      details: { type: 'ConfigError', message: 'Supabase не настроен.' },
    }
  }

  const client = getSupabaseClient()
  if (!client) {
    return {
      ok: false,
      error: 'Supabase не настроен.',
      details: { type: 'ConfigError', message: 'Supabase client is null' },
    }
  }

  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession()

  if (sessionError || !session?.access_token) {
    return {
      ok: false,
      error: friendlyAiError('no_session'),
      details: {
        type: 'AuthError',
        message: sessionError?.message || 'no_session',
      },
    }
  }

  const { data, error } = await client.functions.invoke('generate-brief', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
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
    let details: GenerateBriefErrorDetails
    if (error instanceof FunctionsHttpError) {
      details = await readHttpErrorDetails(error)
    } else {
      details = detailsFromUnknown(error)
    }

    const appCode = details.message
    return {
      ok: false,
      error: friendlyAiError(appCode),
      details,
    }
  }

  const payload = (data ?? {}) as {
    ok?: boolean
    draft?: unknown
    error?: string
  }

  if (!payload.ok) {
    const code = payload.error || 'unknown'
    return {
      ok: false,
      error: friendlyAiError(code),
      details: {
        type: 'ApplicationError',
        status: 200,
        message: code,
        body: sanitizeAiDebugText(JSON.stringify(payload)),
      },
    }
  }

  const validated = validateBriefAiDraft(
    mapServerDraft(payload.draft),
    existingKeys,
  )
  if (!validated.ok) {
    return {
      ok: false,
      error: validated.error,
      details: {
        type: 'ValidationError',
        message: validated.error,
      },
    }
  }

  return { ok: true, draft: validated.draft }
}
