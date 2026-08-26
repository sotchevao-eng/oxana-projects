/**
 * Frontend mirror of Edge PII helpers (placeholders + local substitution).
 * OpenAI must never see real client.name / company / contact values.
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

export function looksLikePersonalField(
  fieldKey: string,
  label = '',
  fieldType = '',
): boolean {
  const type = String(fieldType ?? '').toLowerCase()
  if (type === 'email' || type === 'phone') {
    return true
  }

  const key = fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
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

  const labelNorm = label.trim().toLowerCase()
  if (!labelNorm) return false
  return PII_LABEL_MARKERS.some((marker) => labelNorm.includes(marker))
}

export function shouldMarkPersonalData(
  fieldKey: string,
  label: string,
  fieldType: string,
  explicit?: boolean,
): boolean {
  if (explicit) return true
  return looksLikePersonalField(fieldKey, label, fieldType)
}

export function applyProposalVariables(
  text: string,
  vars: { clientName?: string | null; companyName?: string | null },
): string {
  const clientName = String(vars.clientName ?? '').trim() || 'Клиент'
  const companyName = String(vars.companyName ?? '').trim() || 'Компания'
  return text
    .split(CLIENT_NAME_PLACEHOLDER)
    .join(clientName)
    .split(COMPANY_NAME_PLACEHOLDER)
    .join(companyName)
}

export function applyProposalVariablesDeep<T>(
  value: T,
  vars: { clientName?: string | null; companyName?: string | null },
): T {
  if (typeof value === 'string') {
    return applyProposalVariables(value, vars) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyProposalVariablesDeep(item, vars)) as T
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      next[key] = applyProposalVariablesDeep(item, vars)
    }
    return next as T
  }
  return value
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
    if (serialized.includes(value)) return true
  }
  return false
}

export type SafeBriefAnswer = {
  field_key: string
  question: string
  answer: string
}

function asPlainText(value: unknown): string {
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

export function sanitizeBriefAnswersForAi(
  fields: Array<{
    field_key: string
    label?: string | null
    field_type?: string | null
    is_personal_data?: boolean | null
  }>,
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
    if (
      Boolean(field.is_personal_data) ||
      looksLikePersonalField(fieldKey, label, fieldType)
    ) {
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
}) {
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

export function buildProposalOpenAiUserPrompt(safe: {
  title: string
  project_type: string
  description: string
  task: string
  price: string
  deadline: string
  comment: string
  proposal_style: string
  safe_answers: SafeBriefAnswer[]
}): string {
  const briefLines = safe.safe_answers.map(
    (item) => `- ${item.question}: ${item.answer}`,
  )
  return `Client placeholders (do not invent real values):
- name: ${CLIENT_NAME_PLACEHOLDER}
- company: ${COMPANY_NAME_PLACEHOLDER}

Project:
- title: ${safe.title}
- project_type: ${safe.project_type}
- description: ${safe.description}
- task: ${safe.task}

Brief Q&A (personal answers already removed):
${briefLines.length ? briefLines.join('\n') : '- (no non-personal brief answers)'}

Admin:
- price: ${safe.price || '(not provided — do not invent)'}
- deadline: ${safe.deadline || '(not provided — do not invent)'}
- comment: ${safe.comment || '—'}
- proposal_style: ${safe.proposal_style}`
}
