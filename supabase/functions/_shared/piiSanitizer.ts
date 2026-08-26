/**
 * PD.2 — whitelist PII sanitizer for Edge Functions.
 * Principle: only explicitly allowed fields reach OpenAI.
 * Blacklist / markers are a secondary safety net, never the only control.
 */

export const CLIENT_NAME_PLACEHOLDER = '{{CLIENT_NAME}}'
export const COMPANY_NAME_PLACEHOLDER = '{{COMPANY_NAME}}'

const PII_KEY_MARKERS = [
  'name',
  'fio',
  'full_name',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'contact_person',
  'phone',
  'telephone',
  'email',
  'e_mail',
  'messenger',
  'telegram',
  'whatsapp',
]

const PII_LABEL_MARKERS = [
  'фио',
  'имя',
  'фамилия',
  'отчество',
  'телефон',
  'почта',
  'email',
  'e-mail',
  'messenger',
  'telegram',
  'whatsapp',
  'контактное лицо',
  'контактный телефон',
]

export type BriefFieldMeta = {
  field_key: string
  label?: string | null
  field_type?: string | null
  is_personal_data?: boolean | null
}

export type SafeBriefAnswer = {
  field_key: string
  question: string
  answer: string
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase()
}

export function looksLikePersonalField(
  fieldKey: string,
  label = '',
  fieldType = '',
): boolean {
  const type = String(fieldType ?? '').toLowerCase()
  if (type === 'email' || type === 'phone') {
    return true
  }

  const key = normalizeKey(fieldKey)
  if (
    PII_KEY_MARKERS.some(
      (marker) =>
        key === marker ||
        key.startsWith(`${marker}_`) ||
        key.endsWith(`_${marker}`) ||
        key.includes(`_${marker}_`),
    )
  ) {
    return true
  }

  const labelNorm = normalizeLabel(label)
  if (!labelNorm) {
    return false
  }
  return PII_LABEL_MARKERS.some((marker) => labelNorm.includes(marker))
}

export function asPlainText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value).trim()
}

/** Manual whitelist — never spread client/project objects. */
export function sanitizeProjectForAi(input: {
  project_type?: string | null
  description?: string | null
  task?: string | null
  admin_comment?: string | null
  questions_count?: number | null
}): {
  project_type: string
  description: string
  task: string
  admin_comment: string
  questions_count: number
} {
  return {
    project_type: String(input.project_type ?? '').trim(),
    description: String(input.description ?? '').trim(),
    task: String(input.task ?? '').trim(),
    admin_comment: String(input.admin_comment ?? '').trim(),
    questions_count: Math.min(
      20,
      Math.max(5, Number(input.questions_count) || 10),
    ),
  }
}

export function sanitizeBriefAnswersForAi(
  fields: BriefFieldMeta[],
  answers: Record<string, unknown>,
): {
  safeAnswers: SafeBriefAnswer[]
  personalFieldsRemovedCount: number
} {
  const safeAnswers: SafeBriefAnswer[] = []
  let personalFieldsRemovedCount = 0

  for (const field of fields) {
    const fieldKey = String(field.field_key ?? '').trim()
    if (!fieldKey) continue

    const label = String(field.label ?? '').trim()
    const fieldType = String(field.field_type ?? '').trim()
    const flagged = Boolean(field.is_personal_data)
    const heuristic = looksLikePersonalField(fieldKey, label, fieldType)

    if (flagged || heuristic) {
      personalFieldsRemovedCount += 1
      continue
    }

    const answer = asPlainText(answers[fieldKey])
    if (!answer) continue

    safeAnswers.push({
      field_key: fieldKey,
      question: label || fieldKey,
      answer,
    })
  }

  return { safeAnswers, personalFieldsRemovedCount }
}

export function sanitizeProposalInputForAi(input: {
  project_type?: string | null
  title?: string | null
  description?: string | null
  task?: string | null
  price?: string | null
  deadline?: string | null
  comment?: string | null
  proposal_style?: string | null
  safe_answers?: SafeBriefAnswer[]
}): {
  project_type: string
  title: string
  description: string
  task: string
  price: string
  deadline: string
  comment: string
  proposal_style: string
  client_name_placeholder: string
  company_name_placeholder: string
  safe_answers: SafeBriefAnswer[]
} {
  const style = String(input.proposal_style ?? 'standard').trim()
  return {
    project_type: String(input.project_type ?? '').trim(),
    title: String(input.title ?? '').trim(),
    description: String(input.description ?? '').trim(),
    task: String(input.task ?? '').trim(),
    price: String(input.price ?? '').trim(),
    deadline: String(input.deadline ?? '').trim(),
    comment: String(input.comment ?? '').trim(),
    proposal_style: ['short', 'standard', 'detailed'].includes(style)
      ? style
      : 'standard',
    client_name_placeholder: CLIENT_NAME_PLACEHOLDER,
    company_name_placeholder: COMPANY_NAME_PLACEHOLDER,
    safe_answers: Array.isArray(input.safe_answers)
      ? input.safe_answers.map((item) => ({
          field_key: String(item.field_key ?? '').trim(),
          question: String(item.question ?? '').trim(),
          answer: String(item.answer ?? '').trim(),
        }))
      : [],
  }
}

export function containsKnownPii(
  payload: unknown,
  knownValues: Array<string | null | undefined>,
): boolean {
  const serialized = JSON.stringify(payload)
  if (!serialized) return false

  for (const raw of knownValues) {
    const value = String(raw ?? '').trim()
    if (value.length < 3) continue
    if (serialized.includes(value)) {
      return true
    }
  }
  return false
}

/** Redact secrets / known PII for safe diagnostics — never log originals. */
export function maskPiiForDebug(
  value: string,
  knownValues: Array<string | null | undefined> = [],
  maxLen = 240,
): string {
  let next = value
  for (const raw of knownValues) {
    const token = String(raw ?? '').trim()
    if (token.length < 3) continue
    next = next.split(token).join('[redacted]')
  }
  next = next
    .replace(
      /(authorization|access_token|api[_-]?key|bearer\s+[a-z0-9._-]+|eyJ[a-z0-9_-]+\.[a-z0-9_-]+)/gi,
      '[redacted]',
    )
    .replace(/\s+/g, ' ')
    .trim()
  return next.length > maxLen ? `${next.slice(0, maxLen)}…` : next
}
