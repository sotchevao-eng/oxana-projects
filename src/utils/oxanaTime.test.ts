import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_OXANA_TIMEZONE,
  formatOxanaChatTimestamp,
  msUntilNextOxanaMidnight,
  parseOxanaChatSentAt,
} from './oxanaTime.ts'

test('chat time for today in Europe/Moscow is HH:MM', () => {
  const sentAt = '2026-11-08T17:44:00.000Z'
  const now = new Date('2026-11-08T18:00:00.000Z')
  assert.equal(formatOxanaChatTimestamp(sentAt, now, DEFAULT_OXANA_TIMEZONE), '20:44')
})

test('chat time after Moscow midnight includes the calendar date', () => {
  const sentAt = '2026-11-08T17:44:00.000Z'
  const now = new Date('2026-11-08T21:10:00.000Z')
  assert.equal(
    formatOxanaChatTimestamp(sentAt, now, DEFAULT_OXANA_TIMEZONE),
    '08.11.2026 20:44',
  )
})

test('missing or invalid timestamps are not invented', () => {
  const now = new Date('2026-11-08T18:00:00.000Z')
  assert.equal(formatOxanaChatTimestamp(undefined, now), null)
  assert.equal(formatOxanaChatTimestamp(null, now), null)
  assert.equal(formatOxanaChatTimestamp('', now), null)
  assert.equal(formatOxanaChatTimestamp('не дата', now), null)
  assert.equal(parseOxanaChatSentAt('2026-11-08T17:44:00.000Z'), '2026-11-08T17:44:00.000Z')
  assert.equal(parseOxanaChatSentAt('вчера'), undefined)
})

test('ms until next Moscow midnight crosses 00:00 correctly', () => {
  const beforeMidnight = new Date('2026-11-08T20:59:00.000Z')
  assert.equal(msUntilNextOxanaMidnight(beforeMidnight, DEFAULT_OXANA_TIMEZONE), 60_000)
  const justAfter = new Date('2026-11-08T21:00:00.000Z')
  assert.equal(
    msUntilNextOxanaMidnight(justAfter, DEFAULT_OXANA_TIMEZONE),
    24 * 60 * 60 * 1000,
  )
})
