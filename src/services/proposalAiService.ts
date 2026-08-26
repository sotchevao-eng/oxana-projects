import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import type {
  GenerateProposalErrorDetails,
  GenerateProposalRequest,
  GenerateProposalResponse,
} from '../types/proposalAi'
import { sanitizeAiDebugText } from '../utils/briefAiValidate'
import {
  friendlyProposalAiError,
  validateProposalAiDraft,
} from '../utils/proposalAiValidate'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

function mapServerDraft(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return raw
  }
  const draft = raw as Record<string, unknown>
  const sections = Array.isArray(draft.sections)
    ? draft.sections.map((item) => {
        if (!item || typeof item !== 'object') return item
        const section = item as Record<string, unknown>
        return {
          sectionType: section.sectionType ?? section.section_type,
          title: section.title,
          content: section.content,
          visible: section.visible ?? true,
        }
      })
    : []

  return {
    title: draft.title,
    subtitle: draft.subtitle,
    intro: draft.intro,
    sections,
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

function extractOpenAiDetails(payload: unknown): {
  upstreamStatus?: number
  openaiType?: string
  openaiCode?: string
  openaiMessage?: string
} {
  if (!payload || typeof payload !== 'object') {
    return {}
  }
  const record = payload as Record<string, unknown>
  const openai =
    record.openai && typeof record.openai === 'object'
      ? (record.openai as Record<string, unknown>)
      : null

  return {
    upstreamStatus:
      typeof record.upstreamStatus === 'number'
        ? record.upstreamStatus
        : undefined,
    openaiType: typeof openai?.type === 'string' ? openai.type : undefined,
    openaiCode: typeof openai?.code === 'string' ? openai.code : undefined,
    openaiMessage:
      typeof openai?.message === 'string' ? openai.message : undefined,
  }
}

async function readHttpErrorDetails(
  error: FunctionsHttpError,
): Promise<GenerateProposalErrorDetails> {
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
  const openai = extractOpenAiDetails(parsed)
  return {
    type: 'FunctionsHttpError',
    status,
    message: appCode || error.message,
    body: bodyText ? sanitizeAiDebugText(bodyText) : undefined,
    ...openai,
  }
}

function detailsFromUnknown(error: unknown): GenerateProposalErrorDetails {
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

export async function generateProposalWithAi(
  request: GenerateProposalRequest,
): Promise<GenerateProposalResponse> {
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
      error: friendlyProposalAiError('no_session'),
      details: {
        type: 'AuthError',
        message: sessionError?.message || 'no_session',
      },
    }
  }

  const { data, error } = await client.functions.invoke('generate-proposal', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      projectId: request.projectId,
      price: request.price,
      deadline: request.deadline,
      comment: request.comment,
      proposalStyle: request.proposalStyle,
    },
  })

  if (error) {
    let details: GenerateProposalErrorDetails
    if (error instanceof FunctionsHttpError) {
      details = await readHttpErrorDetails(error)
    } else {
      details = detailsFromUnknown(error)
    }

    return {
      ok: false,
      error: friendlyProposalAiError(details.message),
      details,
    }
  }

  const payload = (data ?? {}) as {
    ok?: boolean
    draft?: unknown
    error?: string
    model?: string
    meta?: {
      count_safe_answers?: number
      count_filtered_personal_fields?: number
    }
    upstreamStatus?: number
    openai?: { type?: string; code?: string; message?: string }
  }

  if (!payload.ok) {
    const code = payload.error || 'unknown'
    const openai = extractOpenAiDetails(payload)
    return {
      ok: false,
      error: friendlyProposalAiError(code),
      details: {
        type: 'ApplicationError',
        status: 200,
        message: code,
        body: sanitizeAiDebugText(JSON.stringify(payload)),
        ...openai,
      },
    }
  }

  const validated = validateProposalAiDraft(
    mapServerDraft(payload.draft),
    request.price,
    request.deadline,
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

  return {
    ok: true,
    draft: validated.draft,
    model: typeof payload.model === 'string' ? payload.model : undefined,
    meta: {
      countSafeAnswers: payload.meta?.count_safe_answers,
      countFilteredPersonalFields: payload.meta?.count_filtered_personal_fields,
    },
  }
}
