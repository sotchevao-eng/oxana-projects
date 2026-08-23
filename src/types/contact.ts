export type ContactProjectType =
  | 'Сайт'
  | 'Web-приложение'
  | 'Автоматизация'
  | 'Игры'
  | 'Мобильное приложение'
  | 'ИИ-помощники'
  | 'Бот'
  | 'Другое'
  | ''

export interface ContactFormData {
  name: string
  company: string
  email: string
  phoneOrTelegram: string
  projectType: ContactProjectType
  description: string
}

export interface ContactRequestPayload extends ContactFormData {
  id: string
  createdAt: string
  source: 'local' | 'supabase'
}

export type ContactFormErrors = Partial<
  Record<keyof ContactFormData | 'contact', string>
>

export interface ContactSubmitResult {
  ok: boolean
  error?: string
  savedLocally?: boolean
}
