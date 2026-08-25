export const CLIENT_PROJECT_STATUSES = [
  'Новый',
  'Бриф подготовлен',
  'Бриф отправлен',
  'Бриф заполнен',
  'КП готовится',
  'КП готово',
  'КП отправлено',
  'КП принято',
  'Нужны изменения',
  'В работе',
  'Завершён',
  'Отменён',
] as const

export type ClientProjectStatus = (typeof CLIENT_PROJECT_STATUSES)[number]

export const CLIENT_PROJECT_TYPES = [
  'Сайт',
  'Интернет-магазин',
  'Web-приложение',
  'Telegram-бот',
  'VK-бот',
  'MAX-бот',
  'Мультиканальный бот',
  'ИИ-помощник',
  'Автоматизация',
  'Игра',
  'Другое',
] as const

export type ClientProjectType = (typeof CLIENT_PROJECT_TYPES)[number]

export function isClientProjectStatus(value: string): value is ClientProjectStatus {
  return (CLIENT_PROJECT_STATUSES as readonly string[]).includes(value)
}

export function isClientProjectType(value: string): value is ClientProjectType {
  return (CLIENT_PROJECT_TYPES as readonly string[]).includes(value)
}
