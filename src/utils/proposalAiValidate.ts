import {
  PROPOSAL_SECTION_TYPES,
  type ProposalSectionType,
} from '../types/proposal'
import type {
  GenerateProposalErrorDetails,
  ProposalAiDraft,
  ProposalAiSectionDraft,
} from '../types/proposalAi'
import { sanitizeAiDebugText } from './briefAiValidate'

const ALLOWED = new Set<string>(PROPOSAL_SECTION_TYPES)

export function validateProposalAiDraft(
  input: unknown,
  adminPrice = '',
  adminDeadline = '',
): { ok: true; draft: ProposalAiDraft } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Некорректный ответ ИИ.' }
  }

  const payload = input as Record<string, unknown>
  const rawSections = Array.isArray(payload.sections) ? payload.sections : []
  if (rawSections.length === 0) {
    return { ok: false, error: 'ИИ не вернул секции КП.' }
  }
  if (rawSections.length > 16) {
    return { ok: false, error: 'Слишком много секций (максимум 16).' }
  }

  const price = adminPrice.trim()
  const deadline = adminDeadline.trim()
  const sections: ProposalAiSectionDraft[] = []

  for (const raw of rawSections.slice(0, 16)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>

    let sectionType = String(
      item.sectionType ?? item.section_type ?? '',
    ).trim()
    if (!ALLOWED.has(sectionType)) {
      continue
    }

    const title = String(item.title ?? '').trim()
    let content = String(item.content ?? '').trim()
    if (!title && !content) {
      continue
    }

    if (sectionType === 'price') {
      if (!price) continue
      content = price
    }
    if (sectionType === 'deadline') {
      if (!deadline) continue
      content = deadline
    }

    sections.push({
      sectionType: sectionType as ProposalSectionType,
      title: title || sectionType,
      content,
      visible: true,
    })
  }

  if (price && !sections.some((s) => s.sectionType === 'price')) {
    sections.push({
      sectionType: 'price',
      title: 'Стоимость',
      content: price,
      visible: true,
    })
  }
  if (deadline && !sections.some((s) => s.sectionType === 'deadline')) {
    sections.push({
      sectionType: 'deadline',
      title: 'Срок',
      content: deadline,
      visible: true,
    })
  }

  if (sections.length === 0) {
    return { ok: false, error: 'После проверки не осталось валидных секций.' }
  }

  return {
    ok: true,
    draft: {
      title:
        String(payload.title ?? '').trim() || 'Коммерческое предложение',
      subtitle: String(payload.subtitle ?? '').trim(),
      intro: String(payload.intro ?? '').trim(),
      sections,
    },
  }
}

export function friendlyProposalAiError(code?: string): string {
  switch (code) {
    case 'unauthorized':
      return 'Нужна авторизация администратора.'
    case 'ai_not_configured':
      return 'ИИ не настроен. Добавьте OPENAI_API_KEY в Supabase Secrets.'
    case 'server_misconfigured':
      return 'Edge Function настроена неверно (SUPABASE_URL / ANON_KEY).'
    case 'project_not_found':
      return 'Проект не найден или нет доступа.'
    case 'project_required':
      return 'Не указан проект.'
    case 'ai_request_failed':
    case 'ai_empty':
      return 'Не удалось получить ответ от ИИ. Попробуйте ещё раз.'
    case 'invalid_ai_response':
      return 'ИИ вернул некорректный JSON.'
    case 'validation_failed':
    case 'empty_sections':
      return 'Ответ ИИ не прошёл проверку секций.'
    case 'too_many_sections':
      return 'Слишком много секций (максимум 16).'
    case 'no_session':
      return 'Сессия не найдена. Войдите в админку снова.'
    case 'pii_detected_in_ai_payload':
      return 'Генерация остановлена: обнаружены данные, которые нельзя передавать в ИИ.'
    default:
      return code?.trim()
        ? code
        : 'Не удалось сгенерировать КП. Попробуйте ещё раз.'
  }
}

export function formatProposalAiErrorForUi(
  details?: GenerateProposalErrorDetails,
  fallback?: string,
): string {
  if (!details) {
    return fallback ?? 'Не удалось сгенерировать КП.'
  }

  const lines = [
    friendlyProposalAiError(fallback ?? details.message),
    `type: ${details.type}`,
  ]
  if (typeof details.status === 'number') {
    lines.push(`status: ${details.status}`)
  }
  if (typeof details.upstreamStatus === 'number') {
    lines.push(`upstreamStatus: ${details.upstreamStatus}`)
  }
  if (details.openaiType) {
    lines.push(`error.type: ${sanitizeAiDebugText(details.openaiType, 120)}`)
  }
  if (details.openaiCode) {
    lines.push(`error.code: ${sanitizeAiDebugText(details.openaiCode, 120)}`)
  }
  if (details.openaiMessage) {
    lines.push(
      `error.message: ${sanitizeAiDebugText(details.openaiMessage, 240)}`,
    )
  }
  if (details.message) {
    lines.push(`message: ${sanitizeAiDebugText(details.message, 240)}`)
  }
  if (details.body) {
    lines.push(`body: ${sanitizeAiDebugText(details.body, 400)}`)
  }
  return lines.join('\n')
}
