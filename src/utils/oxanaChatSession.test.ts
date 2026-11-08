import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  OXANA_CHAT_SESSION_MAX_AGE_MS,
  clearAllOxanaChatSessions,
  clearOxanaChatSession,
  loadOxanaChatSession,
  normalizeProposalStatus,
  oxanaChatSessionKey,
  parseOxanaChatSession,
  saveOxanaChatSession,
  type OxanaChatSessionStorage,
} from './oxanaChatSession.ts'

class MemoryStorage implements OxanaChatSessionStorage {
  private readonly data = new Map<string, string>()

  get length() {
    return this.data.size
  }

  getItem(key: string) {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.data.set(key, value)
  }

  removeItem(key: string) {
    this.data.delete(key)
  }

  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
}

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const TASK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function updateTurn() {
  return {
    role: 'assistant' as const,
    text: 'Предложение изменений подготовлено.',
    proposalStatus: 'open' as const,
    idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    proposal: {
      type: 'update_task' as const,
      taskId: TASK_ID,
      updatedAt: '2026-11-08T16:00:00.000Z',
      fields: ['priority' as const],
      current: {
        title: 'Тест',
        description: null,
        dueAt: null,
        dueLabel: null,
        priority: 'normal' as const,
        status: 'open' as const,
      },
      next: {
        title: 'Тест',
        description: null,
        dueAt: null,
        dueLabel: null,
        priority: 'high' as const,
        status: 'open' as const,
      },
    },
  }
}

test('submitting is restored as open so PATCH is not auto-sent', () => {
  assert.equal(normalizeProposalStatus('submitting'), 'open')
  assert.equal(normalizeProposalStatus('open'), 'open')
})

test('snapshot is scoped to the signed-in user', () => {
  const storage = new MemoryStorage()
  saveOxanaChatSession(
    USER_A,
    { turns: [{ role: 'user', text: 'перенеси задачу' }, updateTurn()], message: '' },
    storage,
  )
  assert.equal(loadOxanaChatSession(USER_B, storage).turns.length, 0)
  assert.equal(loadOxanaChatSession(USER_A, storage).turns.length, 2)
  assert.equal(
    loadOxanaChatSession(USER_A, storage).turns[1]?.role === 'assistant' &&
      loadOxanaChatSession(USER_A, storage).turns[1].proposal?.type,
    'update_task',
  )
})

test('parse rejects another userId and secret-bearing payloads', () => {
  assert.equal(
    parseOxanaChatSession(
      { version: 1, userId: USER_B, turns: [], message: '' },
      USER_A,
    ),
    null,
  )
  assert.equal(
    parseOxanaChatSession(
      {
        version: 1,
        userId: USER_A,
        access_token: 'secret',
        turns: [],
        message: '',
      },
      USER_A,
    ),
    null,
  )
})

test('logout clears stored chat for every user', () => {
  const storage = new MemoryStorage()
  saveOxanaChatSession(
    USER_A,
    { turns: [{ role: 'user', text: 'привет' }], message: 'черновик' },
    storage,
  )
  saveOxanaChatSession(
    USER_B,
    { turns: [{ role: 'user', text: 'чужой' }], message: '' },
    storage,
  )
  clearOxanaChatSession(USER_A, storage)
  assert.equal(loadOxanaChatSession(USER_A, storage).turns.length, 0)
  assert.equal(loadOxanaChatSession(USER_B, storage).turns.length, 1)
  clearAllOxanaChatSessions(storage)
  assert.equal(loadOxanaChatSession(USER_B, storage).turns.length, 0)
})

test('submitting cards are persisted as open drafts', () => {
  const storage = new MemoryStorage()
  const turn = updateTurn()
  turn.proposalStatus = 'submitting'
  saveOxanaChatSession(USER_A, { turns: [turn], message: '' }, storage)
  const loaded = loadOxanaChatSession(USER_A, storage)
  assert.equal(loaded.turns[0]?.role, 'assistant')
  if (loaded.turns[0]?.role === 'assistant') {
    assert.equal(loaded.turns[0].proposalStatus, 'open')
  }
})

test('expired snapshots are discarded and removed', () => {
  const storage = new MemoryStorage()
  const now = 1_700_000_000_000
  saveOxanaChatSession(
    USER_A,
    { turns: [{ role: 'user', text: 'устарело' }], message: '' },
    storage,
    now,
  )
  const loaded = loadOxanaChatSession(
    USER_A,
    storage,
    now + OXANA_CHAT_SESSION_MAX_AGE_MS + 1,
  )
  assert.equal(loaded.turns.length, 0)
  assert.equal(storage.getItem(oxanaChatSessionKey(USER_A)), null)
})

test('confirmed proposals stay confirmed and are not reopened', () => {
  const storage = new MemoryStorage()
  const turn = updateTurn()
  turn.proposalStatus = 'updated'
  saveOxanaChatSession(USER_A, { turns: [turn], message: '' }, storage)
  const loaded = loadOxanaChatSession(USER_A, storage)
  assert.equal(loaded.turns[0]?.role, 'assistant')
  if (loaded.turns[0]?.role === 'assistant') {
    assert.equal(loaded.turns[0].proposalStatus, 'updated')
  }
})

test('stored payload has no tokens or secrets', () => {
  const storage = new MemoryStorage()
  saveOxanaChatSession(
    USER_A,
    { turns: [{ role: 'user', text: 'перенеси задачу' }, updateTurn()], message: '' },
    storage,
  )
  const raw = storage.getItem(oxanaChatSessionKey(USER_A)) ?? ''
  assert.equal(/access_token|refresh_token|Bearer |service_role|password/i.test(raw), false)
  const parsed = JSON.parse(raw) as Record<string, unknown>
  assert.equal(parsed.userId, USER_A)
  assert.equal(typeof parsed.savedAt, 'number')
})
