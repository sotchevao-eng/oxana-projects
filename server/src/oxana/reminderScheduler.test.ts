import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { createApp } from '../app.js'
import { MemoryOxanaRepo } from './memoryRepo.js'
import {
  isReminderRunAtTooOld,
  isRemindersEnvEnabled,
  nextReminderJobStatusOnConflict,
  safeReminderTickErrorCode,
} from './reminderPolicy.js'
import {
  getOxanaReminderSchedulerStatus,
  processDueReminderJobs,
  resetOxanaReminderSchedulerForTests,
  runOxanaReminderTickForTests,
  startOxanaReminderScheduler,
} from './reminderScheduler.js'

describe('oxana reminder scheduler', { concurrency: 1 }, () => {
afterEach(() => {
  resetOxanaReminderSchedulerForTests()
  delete process.env.OXANA_REMINDERS
})

async function waitForLastTick(timeoutMs = 500): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (getOxanaReminderSchedulerStatus().last_tick_at) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('reminder tick did not record status')
}

test('past reminder runAt older than 60s is skipped', () => {
  const now = new Date('2026-11-07T00:00:00.000Z')
  assert.equal(
    isReminderRunAtTooOld(new Date('2026-11-06T23:58:59.000Z'), now),
    true,
  )
  assert.equal(
    isReminderRunAtTooOld(new Date('2026-11-06T23:59:30.000Z'), now),
    false,
  )
})

test('duplicate reminder upsert does not reopen a sent job', () => {
  assert.equal(nextReminderJobStatusOnConflict('sent'), 'sent')
  assert.equal(nextReminderJobStatusOnConflict('pending'), 'pending')
  assert.equal(nextReminderJobStatusOnConflict('claimed'), 'pending')
  assert.equal(nextReminderJobStatusOnConflict('failed'), 'pending')
})

test('tick error codes stay public and drop SQL or secrets', () => {
  const unsafe = Object.assign(
    new Error('update oxana.jobs password=secret postgresql://user:pass@db/oxana'),
    { code: 'postgresql://user:pass@db/oxana' },
  )
  const code = safeReminderTickErrorCode(unsafe)
  assert.equal(code, 'oxana_reminder_tick_failed')
  assert.equal(code.includes('password'), false)
  assert.equal(code.includes('postgresql'), false)

  const pgCode = Object.assign(new Error('SELECT * FROM oxana.jobs'), {
    code: '57P01',
  })
  assert.equal(safeReminderTickErrorCode(pgCode), '57P01')
})

test('scheduler status is idle until started', () => {
  resetOxanaReminderSchedulerForTests()
  const status = getOxanaReminderSchedulerStatus()
  assert.equal(status.enabled, true)
  assert.equal(status.running, false)
  assert.equal(status.last_tick_at, null)
  assert.equal(status.last_tick_success, null)
  assert.equal(status.last_tick_error_code, null)
})

test('OXANA_REMINDERS=disable keeps the scheduler off', () => {
  process.env.OXANA_REMINDERS = 'disable'
  assert.equal(isRemindersEnvEnabled(), false)
  startOxanaReminderScheduler({ processTick: async () => 1 })
  const status = getOxanaReminderSchedulerStatus()
  assert.equal(status.enabled, false)
  assert.equal(status.running, false)
  assert.equal(status.last_tick_at, null)
})

test('successful tick records running status without leaking internals', async () => {
  const lines: string[] = []
  const original = console.info
  console.info = (message?: unknown) => {
    lines.push(String(message))
  }
  try {
    startOxanaReminderScheduler({ processTick: async () => 0 })
    await waitForLastTick()
    const status = getOxanaReminderSchedulerStatus()
    assert.equal(status.enabled, true)
    assert.equal(status.running, true)
    assert.equal(status.last_tick_success, true)
    assert.equal(status.last_tick_error_code, null)
    assert.equal(typeof status.last_tick_at, 'string')
    assert.equal(lines.some((line) => line.includes('oxana_reminder_tick')), true)
    assert.equal(lines.join('\n').includes('password'), false)
    assert.equal(lines.join('\n').includes('SELECT'), false)
  } finally {
    console.info = original
  }
})

test('failed tick records a safe error code and does not stop the API', async () => {
  const lines: string[] = []
  const original = console.info
  console.info = (message?: unknown) => {
    lines.push(String(message))
  }
  try {
    startOxanaReminderScheduler({
      processTick: async () => {
        const error = Object.assign(
          new Error('insert into oxana.notifications password=secret'),
          { code: '28P01' },
        )
        throw error
      },
    })
    await waitForLastTick()
    const status = getOxanaReminderSchedulerStatus()
    assert.equal(status.running, true)
    assert.equal(status.last_tick_success, false)
    assert.equal(status.last_tick_error_code, '28P01')
    const logged = lines.join('\n')
    assert.equal(logged.includes('password'), false)
    assert.equal(logged.includes('insert into'), false)
    assert.equal(logged.includes('28P01'), true)

    const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
    const health = await app.request('/api/health')
    const healthBody = (await health.json()) as Record<string, unknown>
    assert.equal(health.status, 200)
    assert.equal(healthBody.ok, true)
    assert.equal('reminders' in healthBody, false)
  } finally {
    console.info = original
  }
})

test('unsafe tick errors collapse to oxana_reminder_tick_failed', async () => {
  startOxanaReminderScheduler({
    processTick: async () => {
      throw Object.assign(new Error('select password from oxana.jobs'), {
        code: 'postgresql://secret',
      })
    },
  })
  await waitForLastTick()
  const status = getOxanaReminderSchedulerStatus()
  assert.equal(status.last_tick_success, false)
  assert.equal(status.last_tick_error_code, 'oxana_reminder_tick_failed')
  assert.equal(JSON.stringify(status).includes('password'), false)
})

test('one process keeps a single timer', () => {
  startOxanaReminderScheduler({ processTick: async () => 0 })
  startOxanaReminderScheduler({ processTick: async () => 0 })
  assert.equal(getOxanaReminderSchedulerStatus().running, true)
  resetOxanaReminderSchedulerForTests()
  assert.equal(getOxanaReminderSchedulerStatus().running, false)
})

test('processDueReminderJobs is a no-op without a database', async () => {
  delete process.env.OXANA_DATABASE_URL
  assert.equal(await processDueReminderJobs(), 0)
})

test('manual test tick still cannot crash overlapping work', async () => {
  let active = 0
  let maxActive = 0
  startOxanaReminderScheduler({
    processTick: async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 30))
      active -= 1
      return 0
    },
  })
  await Promise.all([
    runOxanaReminderTickForTests(),
    runOxanaReminderTickForTests(),
  ])
  await waitForLastTick()
  assert.equal(maxActive, 1)
  assert.equal(getOxanaReminderSchedulerStatus().last_tick_success, true)
})
})
