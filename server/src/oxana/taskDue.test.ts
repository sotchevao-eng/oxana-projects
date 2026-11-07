import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveProposedDueAt } from './taskDue.js'

test('tomorrow is computed in Europe/Moscow from the server clock', () => {
  const now = new Date('2026-11-07T16:00:00.000Z')
  const resolved = resolveProposedDueAt('tomorrow', 'Europe/Moscow', now)
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.dueLabel, 'завтра')
  assert.equal(resolved.dueAt, '2026-11-08T20:59:00.000Z')
})

test('today uses the owner calendar date, not an ISO datetime from the model', () => {
  const now = new Date('2026-11-07T16:00:00.000Z')
  const resolved = resolveProposedDueAt('today', 'Europe/Moscow', now)
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.dueLabel, 'сегодня')
  assert.equal(resolved.dueAt, '2026-11-07T20:59:00.000Z')
})

test('arbitrary ISO datetimes from the model are rejected', () => {
  const resolved = resolveProposedDueAt(
    '2026-11-08T10:00:00.000Z',
    'Europe/Moscow',
    new Date('2026-11-07T16:00:00.000Z'),
  )
  assert.equal(resolved.ok, false)
})

test('calendar YYYY-MM-DD is accepted when it is not in the past', () => {
  const resolved = resolveProposedDueAt(
    '2026-11-15',
    'Europe/Moscow',
    new Date('2026-11-07T16:00:00.000Z'),
  )
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.dueAt, '2026-11-15T20:59:00.000Z')
})
