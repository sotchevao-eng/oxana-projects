import { safeErrorCode } from '../safeLog.js'

export const REMINDER_TICK_MS = 60_000
export const REMINDER_SKIP_PAST_MS = 60_000

export type ReminderJobStatus =
  | 'pending'
  | 'claimed'
  | 'sent'
  | 'failed'
  | 'skipped'

export function isRemindersEnvEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OXANA_REMINDERS !== 'disable'
}

export function isReminderRunAtTooOld(
  runAt: Date,
  now: Date = new Date(),
): boolean {
  return runAt.getTime() <= now.getTime() - REMINDER_SKIP_PAST_MS
}

export function nextReminderJobStatusOnConflict(
  current: ReminderJobStatus,
): ReminderJobStatus {
  return current === 'sent' ? 'sent' : 'pending'
}

export function safeReminderTickErrorCode(error: unknown): string {
  return safeErrorCode(error) ?? 'oxana_reminder_tick_failed'
}
