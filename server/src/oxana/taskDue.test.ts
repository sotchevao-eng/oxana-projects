import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractCalendarDueToken, resolveProposedDueAt } from './taskDue.js'

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

test('friday is the next Friday in Europe/Moscow', () => {
  const saturday = resolveProposedDueAt(
    'friday',
    'Europe/Moscow',
    new Date('2026-11-07T16:00:00.000Z'),
  )
  assert.equal(saturday.ok, true)
  if (!saturday.ok) return
  assert.equal(saturday.dueLabel, 'пятница')
  assert.equal(saturday.dueAt, '2026-11-13T20:59:00.000Z')
})

test('dotted DD.MM.YYYY time from the owner phrase is Europe/Moscow wall time', () => {
  const token = extractCalendarDueToken(
    'ОКСИ перенеси задачу „Тест создания задачи ОКСИ“ на 14.11.2026, 18:00',
  )
  assert.equal(token, '2026-11-14T18:00')
  const resolved = resolveProposedDueAt(
    token,
    'Europe/Moscow',
    new Date('2026-11-08T18:55:00.000Z'),
  )
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.dueAt, '2026-11-14T15:00:00.000Z')
  assert.equal(resolved.dueLabel?.includes('14 ноября'), true)
  assert.equal(resolved.dueLabel?.includes('18:00'), true)
})

test('Russian calendar date with time is Europe/Moscow wall time', () => {
  const token = extractCalendarDueToken(
    'ОКСИ, найди задачу „Тест создания задачи ОКСИ“ и перенеси срок на 13 ноября 2026 года, 18:00. Покажи изменения для подтверждения, ничего не сохраняй',
  )
  assert.equal(token, '2026-11-13T18:00')
  const resolved = resolveProposedDueAt(
    token,
    'Europe/Moscow',
    new Date('2026-11-07T16:00:00.000Z'),
  )
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.dueAt, '2026-11-13T15:00:00.000Z')
  assert.equal(resolved.dueLabel?.includes('13 ноября'), true)
  assert.equal(resolved.dueLabel?.includes('18:00'), true)
})

test('naive local datetime without Z is accepted as owner timezone', () => {
  const resolved = resolveProposedDueAt(
    '2026-11-13T18:00',
    'Europe/Moscow',
    new Date('2026-11-07T16:00:00.000Z'),
  )
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.dueAt, '2026-11-13T15:00:00.000Z')
})

test('friday is ambiguous when today is already Friday', () => {
  const alreadyFriday = resolveProposedDueAt(
    'пятницу',
    'Europe/Moscow',
    new Date('2026-11-06T16:00:00.000Z'),
  )
  assert.equal(alreadyFriday.ok, false)
  if (alreadyFriday.ok) return
  assert.equal(alreadyFriday.error, 'due_ambiguous')
  if (alreadyFriday.error === 'due_ambiguous') {
    assert.equal(alreadyFriday.weekday, 'пятница')
  }
})
