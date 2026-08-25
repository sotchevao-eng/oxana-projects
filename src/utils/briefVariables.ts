import type { BriefAnswerValue, BriefAnswersMap } from '../types/brief'

function normalizeValue(value: BriefAnswerValue): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  if (typeof value === 'boolean') {
    return value ? 'да' : 'нет'
  }
  return String(value)
}

/**
 * Flatten brief answers into template variables for proposals.
 * Empty values become empty strings (never "undefined").
 */
export function buildBriefVariables(
  answers: BriefAnswersMap | null | undefined,
  system: Record<string, string | null | undefined> = {},
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(system)) {
    result[key] = value?.trim() ? value.trim() : ''
  }

  if (answers) {
    for (const [key, value] of Object.entries(answers)) {
      result[key] = normalizeValue(value)
    }
  }

  return result
}

export function applyTemplateVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = variables[key]
    return value ?? ''
  })
}

export function formatBriefAnswersForCopy(
  fields: Array<{ label: string; fieldKey: string }>,
  answers: BriefAnswersMap,
): string {
  return fields
    .map((field) => {
      const value = normalizeValue(answers[field.fieldKey] ?? null)
      return `${field.label} (${field.fieldKey}):\n${value || '—'}`
    })
    .join('\n\n')
}

export function isAnswerFilled(value: BriefAnswerValue | undefined): boolean {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return true
}

export function calcBriefProgress(
  fields: Array<{ fieldKey: string; required: boolean }>,
  answers: BriefAnswersMap,
): { filled: number; total: number; percent: number } {
  const relevant = fields.length > 0 ? fields : []
  const total = relevant.length
  const filled = relevant.filter((field) =>
    isAnswerFilled(answers[field.fieldKey]),
  ).length
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100)
  return { filled, total, percent }
}
