import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  coerceDueInput,
  extractDueHint,
  extractQuotedTitle,
  looksLikeTaskCreateRequest,
  resolveProposalDescription,
  resolveProposalTitle,
} from './aiPropose.js'
import { looksLikeTaskUpdateRequest } from './aiProposeUpdate.js'
import { resolveProposedDueAt } from './taskDue.js'

const USER_MESSAGE =
  'ОКСИ, подготовь задачу “Тест создания задачи ОКСИ”, приоритет высокий, срок — завтра. Покажи карточку для подтверждения, но пока ничего не сохраняй'

test('create-task phrasing is detected without treating a list question as create', () => {
  assert.equal(looksLikeTaskCreateRequest(USER_MESSAGE), true)
  assert.equal(
    looksLikeTaskCreateRequest('ОКСИ, создай задачу на завтра: проверить документы'),
    true,
  )
  assert.equal(looksLikeTaskCreateRequest('Какие у меня задачи?'), false)
  assert.equal(looksLikeTaskCreateRequest('Что просрочено?'), false)
  assert.equal(
    looksLikeTaskCreateRequest(
      'ОКСИ, перенеси задачу «Тест создания задачи ОКСИ» на пятницу и установи высокий приоритет',
    ),
    false,
  )
  assert.equal(
    looksLikeTaskCreateRequest(
      'ОКСИ, найди задачу „Тест создания задачи ОКСИ“ и перенеси срок на 13 ноября 2026 года, 18:00. Покажи изменения для подтверждения, ничего не сохраняй',
    ),
    false,
  )
})

test('update-task phrasing is distinct from create', () => {
  const updateMessage =
    'ОКСИ, перенеси задачу «Тест создания задачи ОКСИ» на пятницу и установи высокий приоритет'
  assert.equal(looksLikeTaskUpdateRequest(updateMessage), true)
  assert.equal(looksLikeTaskUpdateRequest(USER_MESSAGE), false)
  assert.equal(looksLikeTaskUpdateRequest('Какие у меня задачи?'), false)
  assert.equal(extractDueHint(updateMessage), 'friday')
  assert.equal(
    looksLikeTaskUpdateRequest(
      'ОКСИ, найди задачу „Тест создания задачи ОКСИ“ и перенеси срок на 13 ноября 2026 года, 18:00. Покажи изменения для подтверждения, ничего не сохраняй',
    ),
    true,
  )
})

test('quoted title from the current message wins over an existing task title', () => {
  assert.equal(extractQuotedTitle(USER_MESSAGE), 'Тест создания задачи ОКСИ')
  assert.equal(
    extractQuotedTitle(
      'ОКСИ, найди задачу „Тест создания задачи ОКСИ“ и перенеси срок на 13 ноября 2026 года, 18:00. Покажи изменения для подтверждения, ничего не сохраняй',
    ),
    'Тест создания задачи ОКСИ',
  )
  assert.equal(
    resolveProposalTitle(USER_MESSAGE, 'программа похудения меня и сына', [
      'программа похудения меня и сына',
      'Личная на сегодня',
    ]),
    'Тест создания задачи ОКСИ',
  )
})

test('existing task title and description are not copied into a new draft', () => {
  const stolenTitle = 'программа похудения меня и сына'
  const stolenDescription = 'Пить воду и ходить пешком каждый день'
  assert.equal(
    resolveProposalTitle(
      'ОКСИ, подготовь задачу, приоритет высокий, срок — завтра',
      stolenTitle,
      [stolenTitle],
    ),
    null,
  )
  assert.equal(
    resolveProposalDescription(USER_MESSAGE, stolenDescription, 'Тест создания задачи ОКСИ'),
    null,
  )
})

test('tomorrow in the owner message is resolved in Europe/Moscow', () => {
  assert.equal(extractDueHint(USER_MESSAGE), 'tomorrow')
  assert.equal(coerceDueInput('срок — завтра'), 'tomorrow')
  const now = new Date('2026-11-07T16:00:00.000Z')
  const due = resolveProposedDueAt(
    coerceDueInput(undefined) ?? extractDueHint(USER_MESSAGE),
    'Europe/Moscow',
    now,
  )
  assert.equal(due.ok, true)
  if (!due.ok) return
  assert.equal(due.dueLabel, 'завтра')
  assert.equal(due.dueAt, '2026-11-08T20:59:00.000Z')
})
