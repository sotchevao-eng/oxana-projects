import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeErrorCode, safeErrorName } from './safeLog.js'

test('safe error logs keep only a public code and name', () => {
  const error = Object.assign(new Error('password=secret postgresql://user:pass@db/oxana'), {
    code: '28P01',
    name: 'error',
  })
  assert.equal(safeErrorCode(error), '28P01')
  assert.equal(safeErrorName(error), 'error')
  assert.equal(
    JSON.stringify({
      name: safeErrorName(error),
      code: safeErrorCode(error),
    }).includes('password'),
    false,
  )
})

test('unsafe error codes are omitted', () => {
  const error = Object.assign(new Error('boom'), { code: 'postgresql://secret' })
  assert.equal(safeErrorCode(error), undefined)
})
