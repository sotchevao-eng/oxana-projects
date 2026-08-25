export const BRIEF_FIELD_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'url',
  'single_select',
  'multi_select',
  'checkbox',
] as const

export type BriefFieldType = (typeof BRIEF_FIELD_TYPES)[number]

export const BRIEF_FIELD_TYPE_LABELS: Record<BriefFieldType, string> = {
  short_text: 'Короткий текст',
  long_text: 'Длинный текст',
  email: 'Email',
  phone: 'Телефон',
  number: 'Число',
  date: 'Дата',
  url: 'URL',
  single_select: 'Один вариант',
  multi_select: 'Несколько вариантов',
  checkbox: 'Чекбокс',
}

export type BriefSubmissionStatus = 'draft' | 'submitted'

export type BriefAnswerValue = string | number | boolean | string[] | null

export interface BriefField {
  id: string
  projectId: string
  label: string
  fieldKey: string
  fieldType: BriefFieldType | string
  placeholder: string | null
  helpText: string | null
  required: boolean
  options: string[] | null
  sortOrder: number
  createdAt: string
}

export interface BriefFieldInput {
  label: string
  fieldKey: string
  fieldType: BriefFieldType | string
  placeholder: string
  helpText: string
  required: boolean
  options: string[]
  sortOrder: number
}

export interface BriefSubmission {
  id: string
  projectId: string
  status: BriefSubmissionStatus | string
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BriefAnswer {
  id: string
  submissionId: string
  projectId: string
  fieldKey: string
  value: BriefAnswerValue
  createdAt: string
  updatedAt: string
}

export type BriefAnswersMap = Record<string, BriefAnswerValue>

export interface PublicBriefPayload {
  ok: boolean
  error?: string
  project?: {
    title: string
    projectType: string
    status: string
    clientName: string
  }
  fields?: Array<{
    id: string
    label: string
    fieldKey: string
    fieldType: string
    placeholder: string | null
    helpText: string | null
    required: boolean
    options: string[] | null | unknown
    sortOrder: number
  }>
  submission?: {
    status: string
    submittedAt: string | null
    updatedAt: string | null
  } | null
  answers?: BriefAnswersMap
  missing?: string[]
}

export interface WebsiteBriefTemplateItem {
  label: string
  fieldKey: string
  fieldType: BriefFieldType
  placeholder?: string
  helpText?: string
  required?: boolean
  options?: string[]
}

export const WEBSITE_BRIEF_TEMPLATE: WebsiteBriefTemplateItem[] = [
  {
    label: 'Название компании',
    fieldKey: 'company_name',
    fieldType: 'short_text',
    placeholder: 'Например, OXANA PROJECTS',
    required: true,
  },
  {
    label: 'Чем занимается компания?',
    fieldKey: 'company_description',
    fieldType: 'long_text',
    required: true,
  },
  {
    label: 'Какая основная задача сайта?',
    fieldKey: 'project_goal',
    fieldType: 'long_text',
    required: true,
  },
  {
    label: 'Кто целевая аудитория?',
    fieldKey: 'target_audience',
    fieldType: 'long_text',
    required: true,
  },
  {
    label: 'Какие страницы нужны?',
    fieldKey: 'pages',
    fieldType: 'long_text',
    placeholder: 'Главная, О компании, Услуги, Контакты…',
  },
  {
    label: 'Есть ли фирменный стиль?',
    fieldKey: 'brand_style',
    fieldType: 'long_text',
    helpText: 'Логотип, цвета, шрифты, гайдлайн',
  },
  {
    label: 'Какие сайты нравятся?',
    fieldKey: 'references',
    fieldType: 'long_text',
  },
  {
    label: 'Какой ориентировочный бюджет?',
    fieldKey: 'budget',
    fieldType: 'short_text',
  },
  {
    label: 'Когда желательно запустить проект?',
    fieldKey: 'deadline',
    fieldType: 'short_text',
  },
  {
    label: 'Дополнительные пожелания',
    fieldKey: 'additional_notes',
    fieldType: 'long_text',
  },
]
