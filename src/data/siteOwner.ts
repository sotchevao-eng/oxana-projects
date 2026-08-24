/**
 * Реквизиты владельца сайта для юридических страниц.
 * Заполните вручную то, что нужно отображать публично.
 * Пустые поля на сайте помечаются как «Нужно заполнить владельцу сайта».
 */
export interface SiteOwnerInfo {
  /** ФИО или имя владельца (не обязательно юрлицо) */
  displayName: string
  /** Контактный email для запросов по персональным данным */
  privacyEmail: string
  /** Дополнительный контакт (телефон / Telegram), опционально */
  privacyContact: string
}

export const siteOwner: SiteOwnerInfo = {
  displayName: '',
  privacyEmail: '',
  privacyContact: '',
}

export const SITE_OWNER_TODO = [
  'siteOwner.displayName — имя владельца сайта (если нужно в политике)',
  'siteOwner.privacyEmail — email для запросов по персональным данным (если отличается от email в настройках сайта)',
  'siteOwner.privacyContact — дополнительный контакт (опционально)',
  'Email в админке → Настройки — публичный контакт на сайте и в блоке «Контакты» политики',
] as const

export function isFilled(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

export function fillOrTodo(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : 'Нужно заполнить владельцу сайта'
}
