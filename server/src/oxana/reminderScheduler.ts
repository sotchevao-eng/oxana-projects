import { getOxanaPool, isOxanaDatabaseConfigured } from './db.js'
import { parseNotificationSource } from './validation.js'

const TICK_MS = 60_000

let timer: NodeJS.Timeout | null = null
let ticking = false

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
  } catch {
    try {
      await client.query('rollback')
    } catch {
      // ignore
    }
  } finally {
    client.release()
  }
  return sent
}

export function startOxanaReminderScheduler(): void {
  // One timer per process. Duplicate sends are also blocked in the database
  // by FOR UPDATE SKIP LOCKED and the jobs.idempotency_key unique index.
  if (timer || process.env.OXANA_REMINDERS === 'disable') {
    return
  }
  if (!isOxanaDatabaseConfigured()) {
    return
  }
  const tick = () => {
    if (ticking) return
    ticking = true
    void processDueReminderJobs()
      .catch(() => undefined)
      .finally(() => {
        ticking = false
      })
  }
  tick()
  timer = setInterval(tick, TICK_MS)
  timer.unref?.()
}

export function stopOxanaReminderScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
