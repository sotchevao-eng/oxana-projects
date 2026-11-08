import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isProposalCardLocked,
  proposalCardHeading,
  updateDiffLabel,
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
  assert.equal(isProposalCardLocked('updated'), true)
  assert.equal(isProposalCardLocked('cancelled'), true)
})

test('update heading stays Предлагаемые изменения until a confirmed save', () => {
  assert.equal(proposalCardHeading('open', 'update_task'), 'Предлагаемые изменения')
  assert.equal(
    proposalCardHeading('submitting', 'update_task'),
    'Предлагаемые изменения',
  )
  assert.equal(proposalCardHeading('updated', 'update_task'), 'Задача изменена')
  assert.notEqual(
    proposalCardHeading('open', 'update_task').toUpperCase(),
    'ЗАДАЧА ИЗМЕНЕНА',
  )
})

test('update field labels show Было → Станет as current value then an arrow', () => {
  assert.equal(updateDiffLabel('Название', 'Старая задача'), 'Название · Старая задача →')
  assert.equal(updateDiffLabel('Срок', 'пятница'), 'Срок · пятница →')
  assert.equal(updateDiffLabel('Приоритет', 'Обычный'), 'Приоритет · Обычный →')
  assert.equal(updateDiffLabel('Статус', 'Открыта'), 'Статус · Открыта →')
  assert.equal(updateDiffLabel('Описание', 'нет'), 'Описание · нет →')
})
