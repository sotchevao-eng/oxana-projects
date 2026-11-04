import type { OxanaOwnerSettings } from './types.js'
import { DEFAULT_TIMEZONE } from './time.js'

export const DEFAULT_OWNER_SETTINGS: OxanaOwnerSettings = {
  displayName: '',
  timezone: DEFAULT_TIMEZONE,
  dateFormat: 'datetime',
  notifyTaskDueSoon: true,
  notifyTaskDueDay: true,
  notifyTaskOverdue: true,
  notifyEvent: true,
  taskSoonHours: 24,
  eventSoonMinutes: 30,
}

export function mergeSettings(
  current: OxanaOwnerSettings,
  patch: Partial<OxanaOwnerSettings>,
): OxanaOwnerSettings {
  return { ...current, ...patch }
}
