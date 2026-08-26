import type { BriefFieldType } from './brief'

export interface BriefAiFieldDraft {
  label: string
  fieldKey: string
  fieldType: BriefFieldType | string
  placeholder: string
  helpText: string
  required: boolean
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

export interface GenerateBriefResponse {
  ok: boolean
  draft?: BriefAiDraft
  error?: string
}
