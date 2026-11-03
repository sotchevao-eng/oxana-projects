const MESSAGES: Record<string, string> = {
  unauthorized: 'Нужно войти в админку заново.',
  oxana_forbidden: 'Для ОКСИ нет права доступа.',
  oxana_allowlist_missing: 'Allowlist владельца ОКСИ не настроен на сервере.',
  oxana_db_unavailable: 'База ОКСИ недоступна. Изменения не сохранены.',
  oxana_not_found: 'Запись не найдена в вашем контуре ОКСИ.',
  title_required: 'Укажите название.',
  invalid_status: 'Недопустимый статус.',
  invalid_project_id: 'Некорректный проект.',
  invalid_due_at: 'Некорректная дата.',
  message_required: 'Введите сообщение.',
  ai_not_configured: 'ИИ ОКСИ ещё не подключён. Ответ модели не создан.',
  api_not_configured: 'Адрес российского API ОКСИ не задан.',
  server_error: 'Сервер ОКСИ вернул ошибку.',
}

export function oxanaErrorMessage(code?: string, fallback?: string): string {
  if (code && MESSAGES[code]) {
    return MESSAGES[code]
  }
  if (fallback?.trim()) {
    return fallback.trim()
  }
  return MESSAGES.server_error
}
