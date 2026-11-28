import { serve } from '@hono/node-server'
import { createSmmStagingApp } from './smm/staging.js'
import { closePiiPool } from './db.js'
import { resolveListenOptions } from './listen.js'
import { closeOxanaPool } from './oxana/db.js'
import {
  getOxanaReminderSchedulerStatus,
  startOxanaReminderScheduler,
  stopOxanaReminderScheduler,
} from './oxana/reminderScheduler.js'

const isolatedSmoke = process.env.OXANA_STAGING_SMOKE_ONLY === 'true'
const app = isolatedSmoke ? createSmmStagingApp() : (await import('./app.js')).createApp()
const { port, hostname } = resolveListenOptions()

const server = serve({ fetch: app.fetch, port, hostname }, () => {
  if (!isolatedSmoke) startOxanaReminderScheduler()
  console.info(
    JSON.stringify({
      event: 'pii_api_listen',
      port,
      hostname,
      reminders: isolatedSmoke ? 'disabled_for_smoke' : getOxanaReminderSchedulerStatus(),
    }),
  )
})

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  console.info(JSON.stringify({ event: 'api_shutdown', signal }))
  stopOxanaReminderScheduler()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
    setTimeout(resolve, 5000).unref?.()
  })
  await Promise.all([closePiiPool(), closeOxanaPool()])
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
