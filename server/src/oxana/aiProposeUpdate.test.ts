import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  executeOxanaProposeUpdateTask,
  findActiveTasksByTitle,
  looksLikeTaskUpdateRequest,
} from './aiProposeUpdate.js'
import { MemoryOxanaRepo } from './memoryRepo.js'
import type { OxanaTask } from './types.js'

const OWNER = '11111111-1111-4111-8111-111111111111'
const CLIENT_WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TITLE = 'Тест создания задачи ОКСИ'
const UPDATE_MESSAGE =
  'ОКСИ, перенеси задачу «Тест создания задачи ОКСИ» на пятницу и установи высокий приоритет'
const NOW = new Date('2026-11-07T16:00:00.000Z')

async function seedOwnerTask(
  extras?: Partial<{
    title: string
    description: string | null
    dueAt: string | null
    priority: OxanaTask['priority']
    archivedAt: string | null
  }>,
) {
  const repo = new MemoryOxanaRepo()
  const owner = await repo.ensureWorkspaceForUser(OWNER)
  const task = await repo.createTask(owner.id, OWNER, {
    title: extras?.title ?? TITLE,
    description: extras?.description ?? 'не менять',
    projectId: null,
    dueAt: extras?.dueAt ?? '2026-11-09T20:59:00.000Z',
    priority: extras?.priority ?? 'normal',
  })
  if (extras?.archivedAt) {
    await repo.updateTask(owner.id, task.id, { archivedAt: extras.archivedAt })
  }
  return { repo, owner, task: await repo.getTask(owner.id, task.id) }
}

test('exact title match proposes due and priority only', async () => {
  const { repo, owner, task } = await seedOwnerTask()
  const result = await executeOxanaProposeUpdateTask(
    { title: TITLE, due: 'tomorrow', priority: 'low', description: 'не менять' },
    {
      repo,
      workspaceId: owner.id,
      userId: OWNER,
      userMessage: UPDATE_MESSAGE,
      now: NOW,
    },
  )
  assert.equal(result.kind, 'proposal')
  assert.equal(result.proposal?.type, 'update_task')
  if (result.proposal?.type !== 'update_task') return
  assert.equal(result.proposal.taskId, task.id)
  assert.deepEqual(result.proposal.fields, ['dueAt', 'priority'])
  assert.equal(result.proposal.current.priority, 'normal')
  assert.equal(result.proposal.next.priority, 'high')
  assert.equal(result.proposal.next.dueLabel, 'пятница')
  assert.equal(result.proposal.next.dueAt, '2026-11-13T20:59:00.000Z')
  assert.equal(result.proposal.next.description, 'не менять')
  assert.equal(result.proposal.next.title, TITLE)
  assert.equal(result.payload.created, false)
  assert.equal(result.payload.updated, false)
  const listed = await repo.listTasks(owner.id)
  assert.equal(listed[0]?.dueAt, task.dueAt)
  assert.equal(listed[0]?.priority, 'normal')
})

test('ambiguous titles do not pick the first match', async () => {
  const { repo, owner } = await seedOwnerTask()
  await repo.createTask(owner.id, OWNER, {
    title: TITLE,
    description: 'вторая',
    projectId: null,
    dueAt: null,
    priority: 'low',
  })
  const result = await executeOxanaProposeUpdateTask(
    { title: TITLE, due: 'friday', priority: 'high' },
    {
      repo,
      workspaceId: owner.id,
      userId: OWNER,
      userMessage: UPDATE_MESSAGE,
      now: NOW,
    },
  )
  assert.equal(result.kind, 'choose')
  assert.equal(result.proposal?.type, 'choose_task')
  if (result.proposal?.type !== 'choose_task') return
  assert.equal(result.proposal.matches.length, 2)
  assert.equal(result.payload.error, 'task_ambiguous')
  assert.equal(Array.isArray(result.payload.matches), true)
  const payloadMatches = result.payload.matches as Array<Record<string, unknown>>
  assert.equal(
    payloadMatches.every((item) => item.id === undefined),
    true,
  )
})

test('missing task does not create a new one', async () => {
  const { repo, owner } = await seedOwnerTask({ title: 'Другая задача' })
  const createdBefore = (await repo.listTasks(owner.id)).length
  const result = await executeOxanaProposeUpdateTask(
    { title: TITLE, due: 'friday', priority: 'high' },
    {
      repo,
      workspaceId: owner.id,
      userId: OWNER,
      userMessage: UPDATE_MESSAGE,
      now: NOW,
    },
  )
  assert.equal(result.kind, 'rejected')
  assert.equal(result.proposal, null)
  assert.equal(result.payload.error, 'task_not_found')
  assert.equal(result.payload.created, false)
  assert.equal((await repo.listTasks(owner.id)).length, createdBefore)
})

test('foreign workspace task is not found by title search', async () => {
  const { repo, owner } = await seedOwnerTask({ title: 'Личная' })
  repo.assignUserToWorkspace(OWNER, {
    id: CLIENT_WORKSPACE_ID,
    slug: 'client',
    name: 'Клиент',
    kind: 'client',
  })
  await repo.createTask(CLIENT_WORKSPACE_ID, OWNER, {
    title: TITLE,
    description: 'чужая',
    projectId: null,
    dueAt: null,
    priority: 'urgent',
  })
  const result = await executeOxanaProposeUpdateTask(
    { title: TITLE, due: 'friday', priority: 'high' },
    {
      repo,
      workspaceId: owner.id,
      userId: OWNER,
      userMessage: UPDATE_MESSAGE,
      now: NOW,
    },
  )
  assert.equal(result.kind, 'rejected')
  assert.equal(result.payload.error, 'task_not_found')
})

test('archived and partial titles are not matches', () => {
  const tasks = [
    {
      id: '1',
      title: TITLE,
      archivedAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: '2',
      title: 'Тест создания',
      archivedAt: null,
    },
  ] as OxanaTask[]
  assert.equal(findActiveTasksByTitle(tasks, TITLE).length, 0)
  assert.equal(findActiveTasksByTitle(tasks, 'тест создания задачи окси').length, 0)
})

test('create phrasing is not treated as an update request', () => {
  assert.equal(
    looksLikeTaskUpdateRequest(
      'ОКСИ, подготовь задачу “Тест создания задачи ОКСИ”, приоритет высокий, срок — завтра',
    ),
    false,
  )
})

test('friday today does not guess a due date', async () => {
  const { repo, owner } = await seedOwnerTask()
  const result = await executeOxanaProposeUpdateTask(
    { title: TITLE, due: 'friday', priority: 'high' },
    {
      repo,
      workspaceId: owner.id,
      userId: OWNER,
      userMessage: UPDATE_MESSAGE,
      now: new Date('2026-11-06T16:00:00.000Z'),
    },
  )
  assert.equal(result.kind, 'proposal')
  if (result.proposal?.type !== 'update_task') return
  assert.equal(result.proposal.dueNeedsClarification, true)
  assert.equal(result.proposal.dueAmbiguousWeekday, 'пятница')
  assert.equal(result.proposal.next.dueAt, result.proposal.current.dueAt)
  assert.equal(result.proposal.next.priority, 'high')
  assert.equal(result.proposal.fields.includes('dueAt'), true)
  assert.equal(result.proposal.fields.includes('priority'), true)
})
