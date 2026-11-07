const MESSAGES: Record<string, string> = {
  unauthorized: 'Нужно войти в админку заново.',
  oxana_forbidden: 'Для ОКСИ нет права доступа.',
  oxana_allowlist_missing: 'Allowlist владельца ОКСИ не настроен на сервере.',
  oxana_db_unavailable: 'База ОКСИ недоступна. Изменения не сохранены.',
  oxana_not_found: 'Запись не найдена в вашем контуре ОКСИ.',
  title_required: 'Укажите название.',
  invalid_status: 'Недопустимый статус.',
  invalid_priority: 'Недопустимый приоритет.',
  invalid_task_id: 'Некорректная задача.',
  invalid_project_id: 'Некорректный проект.',
  invalid_event_id: 'Некорректное событие.',
  invalid_notification_id: 'Некорректное уведомление.',
  invalid_starts_at: 'Некорректное время начала.',
  invalid_ends_at: 'Некорректное время окончания.',
  invalid_remind_at: 'Некорректное время напоминания.',
  validation_failed: 'Проверьте заполненные поля.',
  invalid_due_at: 'Некорректная дата.',
  invalid_idempotency_key: 'Повторный запрос отклонён. Обновите карточку.',
  idempotency_key_conflict: 'Этот ключ уже использован для другой задачи.',
  project_ambiguous: 'Уточните проект — найдено несколько совпадений.',
  message_required: 'Введите сообщение.',
  ai_not_configured: 'ИИ ОКСИ ещё не подключён. Ответ модели не создан.',
  ai_auth_failed: 'GigaChat отклонил авторизацию. Ответ модели не создан.',
  ai_unavailable: 'Сервис GigaChat недоступен. Ответ модели не создан.',
  ai_rate_limited: 'Превышен лимит GigaChat. Ответ модели не создан.',
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
