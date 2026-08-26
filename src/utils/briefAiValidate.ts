import { BRIEF_FIELD_TYPES, type BriefFieldType } from '../types/brief'
import type { BriefAiDraft, BriefAiFieldDraft } from '../types/briefAi'
import { ensureUniqueFieldKey, isValidFieldKey, slugifyFieldKey } from './fieldKey'

const ALLOWED = new Set<string>(BRIEF_FIELD_TYPES)

export function normalizeAiFieldKey(raw: string, label: string): string {
  const fromKey = raw.trim()
  const base = isValidFieldKey(fromKey)
    ? fromKey
    : slugifyFieldKey(fromKey || label)
  return base || 'field'
}

export function validateBriefAiDraft(
  input: unknown,
  existingKeys: string[] = [],
): { ok: true; draft: BriefAiDraft } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Некорректный ответ ИИ.' }
  }

  const payload = input as Record<string, unknown>
  const rawFields = Array.isArray(payload.fields) ? payload.fields : []
  if (rawFields.length === 0) {
    return { ok: false, error: 'ИИ не вернул вопросы.' }
  }
  if (rawFields.length > 20) {
    return { ok: false, error: 'Слишком много вопросов (максимум 20).' }
  }

  const used = [...existingKeys]
  const fields: BriefAiFieldDraft[] = []

  for (const raw of rawFields.slice(0, 20)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>

    const label = String(item.label ?? item.Label ?? '').trim()
    if (!label) continue

    const rawKey = String(
      item.fieldKey ?? item.field_key ?? '',
    ).trim()
    const uniqueKey = ensureUniqueFieldKey(
      normalizeAiFieldKey(rawKey, label),
      used,
    )
    used.push(uniqueKey)

    let fieldType = String(item.fieldType ?? item.field_type ?? 'short_text')
    if (!ALLOWED.has(fieldType)) {
      fieldType = 'short_text'
    }

    const options = Array.isArray(item.options)
      ? item.options.map((o) => String(o).trim()).filter(Boolean)
      : []

    if (
      (fieldType === 'single_select' || fieldType === 'multi_select') &&
      options.length === 0
    ) {
      fieldType = 'long_text'
    }

    fields.push({
      label,
      fieldKey: uniqueKey,
      fieldType: fieldType as BriefFieldType,
      placeholder: String(item.placeholder ?? '').trim(),
      helpText: String(item.helpText ?? item.help_text ?? '').trim(),
      required: Boolean(item.required),
      options:
        fieldType === 'single_select' || fieldType === 'multi_select'
          ? options
          : [],
    })
  }

  if (fields.length === 0) {
    return { ok: false, error: 'После проверки не осталось валидных вопросов.' }
  }

  return {
    ok: true,
    draft: {
      title: String(payload.title ?? '').trim(),
      intro: String(payload.intro ?? '').trim(),
      fields,
    },
  }
}

export function friendlyAiError(code?: string): string {
  switch (code) {
    case 'unauthorized':
      return 'Нужна авторизация администратора.'
    case 'ai_not_configured':
      return 'ИИ не настроен. Добавьте OPENAI_API_KEY в Supabase Secrets.'
    case 'project_not_found':
      return 'Проект не найден или нет доступа.'
    case 'project_required':
      return 'Не указан проект.'
    case 'ai_request_failed':
    case 'ai_empty':
      return 'Не удалось получить ответ от ИИ. Попробуйте ещё раз.'
    case 'empty_fields':
      return 'ИИ не вернул вопросы.'
    case 'too_many_fields':
      return 'Слишком много вопросов (максимум 20).'
    case 'Failed to send a request to the Edge Function':
    case 'Edge Function returned a non-2xx status code':
      return 'Edge Function недоступна. Проверьте деплой generate-brief.'
    default:
      return code?.trim()
        ? code
        : 'Не удалось сгенерировать бриф. Попробуйте ещё раз.'
  }
}
