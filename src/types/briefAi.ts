import type { BriefFieldType } from './brief'

export interface BriefAiFieldDraft {
  label: string
  fieldKey: string
  fieldType: BriefFieldType | string
  placeholder: string
  helpText: string
  required: boolean
  isPersonalData?: boolean
  options: string[]
}

export interface BriefAiDraft {
  title: string
  intro: string
  fields: BriefAiFieldDraft[]
}

export interface GenerateBriefRequest {
  projectId: string
  projectType: string
  description: string
  task: string
  aiComment: string
  questionsCount: number
}

/** Safe diagnostics shown in admin UI (no secrets). */
export interface GenerateBriefErrorDetails {
  type: string
  status?: number
  message: string
  body?: string
}

export interface GenerateBriefResponse {
  ok: boolean
  draft?: BriefAiDraft
  error?: string
  details?: GenerateBriefErrorDetails
}
