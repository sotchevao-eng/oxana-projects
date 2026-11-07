import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashTaskCreateInput } from './idempotency.js'
import type { CreateTaskInput } from './types.js'

const base: CreateTaskInput = {
  title: 'Проверить документы поставщика',
  description: null,
  dueAt: '2026-11-08T20:59:00.000Z',
  projectId: null,
  priority: 'high',
}

test('task create hash is stable for the same payload', () => {
  assert.equal(hashTaskCreateInput(base), hashTaskCreateInput({ ...base }))
})

test('task create hash changes when title, due date or priority changes', () => {
  const original = hashTaskCreateInput(base)
  assert.notEqual(
    original,
    hashTaskCreateInput({ ...base, title: 'Другая задача' }),
  )
  assert.notEqual(
    original,
    hashTaskCreateInput({ ...base, dueAt: '2026-11-09T20:59:00.000Z' }),
  )
  assert.notEqual(
    original,
    hashTaskCreateInput({ ...base, priority: 'low' }),
  )
})
