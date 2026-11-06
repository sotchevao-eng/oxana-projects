import type {
  OxanaProjectStatus,
  OxanaTask,
  OxanaTaskPriority,
  OxanaTaskStatus,
} from '../../../types/oxana'

export type OxanaTabId =
  | 'overview'
  | 'chat'
  | 'tasks'
  | 'calendar'
  | 'projects'
  | 'notifications'
  | 'settings'

export interface OxanaFocus {
  tab: OxanaTabId
  taskId?: string
  projectId?: string
  eventId?: string
}

export const OXANA_FIELD_CLASS =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-60'

export const TASK_STATUS_LABELS: Record<OxanaTaskStatus, string> = {
  open: 'Открыта',
  in_progress: 'В работе',
  done: 'Готово',
  cancelled: 'Отменена',
}

export const PROJECT_STATUS_LABELS: Record<OxanaProjectStatus, string> = {
  planned: 'Запланирован',
  active: 'Активный',
  paused: 'Приостановлен',
  done: 'Завершён',
  archived: 'В архиве',
}

export const TASK_PRIORITY_LABELS: Record<OxanaTaskPriority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
}

export function isArchivedTask(
  task: Pick<OxanaTask, 'archivedAt'> | OxanaTaskStatus,
): boolean {
  if (typeof task === 'string') {
    return task === 'done' || task === 'cancelled'
  }
  return Boolean(task.archivedAt)
}
