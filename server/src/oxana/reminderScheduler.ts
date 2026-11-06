import { getOxanaPool, isOxanaDatabaseConfigured } from './db.js'
import {
  isRemindersEnvEnabled,
  REMINDER_TICK_MS,
  safeReminderTickErrorCode,
} from './reminderPolicy.js'
import { parseNotificationSource } from './validation.js'

export interface OxanaReminderSchedulerStatus {
  enabled: boolean
  running: boolean
  last_tick_at: string | null
  last_tick_success: boolean | null
  last_tick_error_code: string | null
}

type ReminderTickFn = () => Promise<number>

let timer: NodeJS.Timeout | null = null
let ticking = false
let lastTickAt: string | null = null
let lastTickSuccess: boolean | null = null
let lastTickErrorCode: string | null = null
let tickOverride: ReminderTickFn | null = null

function logReminderEvent(payload: Record<string, unknown>): void {
  console.info(JSON.stringify(payload))
}

function recordTick(success: boolean, errorCode: string | null): void {
  lastTickAt = new Date().toISOString()
  lastTickSuccess = success
  lastTickErrorCode = success ? null : errorCode
}

export function getOxanaReminderSchedulerStatus(): OxanaReminderSchedulerStatus {
  return {
    enabled: isRemindersEnvEnabled(),
    running: timer !== null,
    last_tick_at: lastTickAt,
    last_tick_success: lastTickSuccess,
    last_tick_error_code: lastTickErrorCode,
  }
}

export async function processDueReminderJobs(): Promise<number> {
  if (!isOxanaDatabaseConfigured()) {
    return 0
  }
  const pool = getOxanaPool()
  const client = await pool.connect()
  let sent = 0
  try {
    await client.query('begin')
    const due = await client.query<{
      id: string
      workspace_id: string
      payload: {
        userId?: string
        title?: string
        body?: string
        sourceType?: string
        sourceId?: string
      }
    }>(
      `update oxana.jobs
       set status = 'claimed', claimed_at = now(), attempts = attempts + 1
       where id in (
         select id from oxana.jobs
         where kind = 'reminder'
           and status = 'pending'
           and run_at <= now()
           and idempotency_key not like 'oxana-prefs:%'
         order by run_at asc
         limit 20
         for update skip locked
       )
       returning id, workspace_id, payload`,
    )
    for (const job of due.rows) {
      const userId = String(job.payload?.userId ?? '')
      const title = String(job.payload?.title ?? 'Напоминание ОКСИ')
      const body = job.payload?.body ? String(job.payload.body) : null
      const parsed = parseNotificationSource(body)
      const sourceType = job.payload?.sourceType || parsed?.sourceType || null
      const sourceId = job.payload?.sourceId || parsed?.sourceId || null
      try {
        if (userId) {
          await client.query(
            `insert into oxana.notifications (
               workspace_id, user_id, title, body, channel, source_type, source_id
             ) values ($1, $2, $3, $4, 'web', $5, $6)`,
            [job.workspace_id, userId, title, body, sourceType, sourceId],
          )
        }
        await client.query(
          `update oxana.jobs set status = 'sent', last_error = null where id = $1`,
          [job.id],
        )
        sent += 1
      } catch {
        await client.query(
          `update oxana.jobs
           set status = 'failed', last_error = 'notification_insert_failed'
           where id = $1`,
          [job.id],
        )
      }
    }
    await client.query('commit')
    return sent
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // ignore
    }
    const wrapped = new Error('oxana_reminder_tick_failed')
    wrapped.name = 'OxanaReminderTickError'
    ;(wrapped as Error & { code: string }).code =
      safeReminderTickErrorCode(error)
    throw wrapped
  } finally {
    client.release()
  }
}

async function runScheduledTick(): Promise<void> {
  if (ticking) {
    return
  }
  ticking = true
  try {
    const tick = tickOverride ?? processDueReminderJobs
    await tick()
    logReminderEvent({ event: 'oxana_reminder_tick', ok: true })
    recordTick(true, null)
  } catch (error) {
    const errorCode = safeReminderTickErrorCode(error)
    logReminderEvent({
      event: 'oxana_reminder_tick',
      ok: false,
      error_code: errorCode,
    })
    recordTick(false, errorCode)
  } finally {
    ticking = false
  }
}

export function startOxanaReminderScheduler(options: {
  processTick?: ReminderTickFn
} = {}): void {
  if (timer || !isRemindersEnvEnabled()) {
    return
  }
  if (options.processTick) {
    tickOverride = options.processTick
  } else if (!isOxanaDatabaseConfigured()) {
    return
  }
  const tick = () => {
    void runScheduledTick()
  }
  tick()
  timer = setInterval(tick, REMINDER_TICK_MS)
  timer.unref?.()
}

export function stopOxanaReminderScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export async function runOxanaReminderTickForTests(): Promise<void> {
  await runScheduledTick()
}

export function resetOxanaReminderSchedulerForTests(): void {
  stopOxanaReminderScheduler()
  ticking = false
  lastTickAt = null
  lastTickSuccess = null
  lastTickErrorCode = null
  tickOverride = null
}
