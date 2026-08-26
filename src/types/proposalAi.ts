import type { ProposalSectionType } from './proposal'

export const PROPOSAL_AI_STYLES = ['short', 'standard', 'detailed'] as const

export type ProposalAiStyle = (typeof PROPOSAL_AI_STYLES)[number]

export const PROPOSAL_AI_STYLE_LABELS: Record<ProposalAiStyle, string> = {
  short: 'Краткое',
  standard: 'Стандартное',
  detailed: 'Подробное',
}

export interface ProposalAiSectionDraft {
  sectionType: ProposalSectionType | string
  title: string
  content: string
  visible: boolean
}

export interface ProposalAiDraft {
  title: string
  subtitle: string
  intro: string
  sections: ProposalAiSectionDraft[]
}

export interface GenerateProposalRequest {
  projectId: string
  price: string
  deadline: string
  comment: string
  proposalStyle: ProposalAiStyle
}

/** Safe diagnostics shown in admin UI (no secrets). */
export interface GenerateProposalErrorDetails {
  type: string
  status?: number
  upstreamStatus?: number
  message: string
  body?: string
  openaiType?: string
  openaiCode?: string
  openaiMessage?: string
}

export interface GenerateProposalResponse {
  ok: boolean
  draft?: ProposalAiDraft
  model?: string
  error?: string
  details?: GenerateProposalErrorDetails
}
