import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { closePiiPool } from './db.js'
import { resolveListenOptions } from './listen.js'
import { closeOxanaPool } from './oxana/db.js'
import {
  getOxanaReminderSchedulerStatus,
  startOxanaReminderScheduler,
  stopOxanaReminderScheduler,
} from './oxana/reminderScheduler.js'

const app = createApp()
const { port, hostname } = resolveListenOptions()

const server = serve({ fetch: app.fetch, port, hostname }, () => {
  startOxanaReminderScheduler()
  console.info(
    JSON.stringify({
      event: 'pii_api_listen',
      port,
      hostname,
      reminders: getOxanaReminderSchedulerStatus(),
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
