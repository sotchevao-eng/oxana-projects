import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isProposalCardLocked,
  proposalCardHeading,
} from './oxanaProposalCard.ts'

test('draft heading stays Черновик задачи until a confirmed save', () => {
  assert.equal(proposalCardHeading('open'), 'Черновик задачи')
  assert.equal(proposalCardHeading('submitting'), 'Черновик задачи')
  assert.equal(proposalCardHeading('cancelled'), 'Черновик задачи')
  assert.equal(proposalCardHeading('created'), 'Задача создана')
  assert.equal(proposalCardHeading('open').toUpperCase(), 'ЧЕРНОВИК ЗАДАЧИ')
  assert.notEqual(proposalCardHeading('open').toUpperCase(), 'ЗАДАЧА СОЗДАНА')
})

test('only an open draft can be edited or confirmed', () => {
  assert.equal(isProposalCardLocked('open'), false)
  assert.equal(isProposalCardLocked('submitting'), true)
  assert.equal(isProposalCardLocked('created'), true)
  assert.equal(isProposalCardLocked('cancelled'), true)
})
