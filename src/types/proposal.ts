export const PROPOSAL_STATUSES = [
  'draft',
  'ready',
  'published',
  'accepted',
  'changes_requested',
  'archived',
] as const

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Черновик',
  ready: 'Готово',
  published: 'Опубликовано',
  accepted: 'Принято',
  changes_requested: 'Нужны изменения',
  archived: 'В архиве',
}

export const PROPOSAL_SECTION_TYPES = [
  'client',
  'task',
  'solution',
  'scope',
  'stages',
  'deadline',
  'price',
  'options',
  'conditions',
  'cta',
] as const

export type ProposalSectionType = (typeof PROPOSAL_SECTION_TYPES)[number]

export const PROPOSAL_SECTION_TYPE_LABELS: Record<ProposalSectionType, string> = {
  client: 'Клиент',
  task: 'Задача',
  solution: 'Решение',
  scope: 'Что входит',
  stages: 'Этапы',
  deadline: 'Срок',
  price: 'Стоимость',
  options: 'Доп. опции',
  conditions: 'Условия',
  cta: 'CTA',
}

export interface ProposalSection {
  id?: string
  proposalId?: string
  sectionType: ProposalSectionType | string
  title: string
  content: string
  sortOrder: number
  visible: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Proposal {
  id: string
  projectId: string
  title: string
  subtitle: string
  intro: string
  price: string
  deadline: string
  status: ProposalStatus | string
  published: boolean
  acceptedAt: string | null
  changesRequestedAt: string | null
  createdAt: string
  updatedAt: string
  sections: ProposalSection[]
}

export interface ProposalFormValues {
  title: string
  subtitle: string
  intro: string
  price: string
  deadline: string
  status: ProposalStatus | string
  sections: ProposalSection[]
}

export function emptyProposalForm(): ProposalFormValues {
  return {
    title: 'Коммерческое предложение',
    subtitle: '',
    intro: '',
    price: '',
    deadline: '',
    status: 'draft',
    sections: defaultProposalSections(),
  }
}

export function defaultProposalSections(): ProposalSection[] {
  const defaults: Array<{
    sectionType: ProposalSectionType
    title: string
    content: string
  }> = [
    { sectionType: 'client', title: 'Клиент', content: '' },
    { sectionType: 'task', title: 'Задача', content: '' },
    { sectionType: 'solution', title: 'Предлагаемое решение', content: '' },
    { sectionType: 'scope', title: 'Что входит', content: '' },
    { sectionType: 'stages', title: 'Этапы работы', content: '' },
    { sectionType: 'deadline', title: 'Срок', content: '' },
    { sectionType: 'price', title: 'Стоимость', content: '' },
    { sectionType: 'options', title: 'Дополнительные опции', content: '' },
    { sectionType: 'conditions', title: 'Условия', content: '' },
    { sectionType: 'cta', title: 'Следующий шаг', content: '' },
  ]

  return defaults.map((item, index) => ({
    sectionType: item.sectionType,
    title: item.title,
    content: item.content,
    sortOrder: index,
    visible: true,
  }))
}

/** Public RPC payload (snake_case — matches get_public_proposal). */
export interface PublicProposalSection {
  section_type: string
  title: string | null
  content: string | null
  sort_order: number
}

export interface PublicProposalPayload {
  ok: boolean
  error?: string
  project?: {
    title: string
    project_type: string
  }
  client?: {
    name: string | null
    company: string | null
  }
  proposal?: {
    title: string | null
    subtitle: string | null
    intro: string | null
    price: string | null
    deadline: string | null
    status: string
  }
  sections?: PublicProposalSection[]
}
