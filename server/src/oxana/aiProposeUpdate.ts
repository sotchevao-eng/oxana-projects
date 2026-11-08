import { titleForExternalModel } from './aiTools.js'
import {
  coerceDueInput,
  extractDueHint,
  extractQuotedTitle,
  looksLikeTaskCreateRequest,
  resolveProposalDescription,
} from './aiPropose.js'
import type { GigachatFunctionDefinition } from './gigachatClient.js'
import { formatDueLabel, resolveProposedDueAt } from './taskDue.js'
import type {
  OxanaRepository,
  OxanaTask,
  OxanaTaskPriority,
  OxanaTaskStatus,
  UpdateTaskInput,
} from './types.js'
import { clampText } from './validation.js'

export const OXANA_PROPOSE_UPDATE_TASK = 'oxana_propose_update_task'

export const OXANA_UPDATE_PROPOSAL_REPLY = 'Предложение изменений подготовлено'
export const OXANA_CHOOSE_TASK_REPLY =
  'Нашлось несколько задач с таким названием. Выберите нужную.'
export const OXANA_TASK_NOT_FOUND_REPLY =
  'Задача с таким названием не найдена. Новую задачу не создаю.'

const PRIORITIES: readonly OxanaTaskPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
]

const UPDATE_STATUSES: readonly OxanaTaskStatus[] = ['open', 'in_progress']

export type OxanaUpdateField =
  | 'title'
  | 'description'
  | 'dueAt'
  | 'priority'
  | 'status'

export interface OxanaTaskSnapshot {
  title: string
  description: string | null
  dueAt: string | null
  dueLabel: string | null
  priority: OxanaTaskPriority
  status: OxanaTaskStatus
}

export interface OxanaUpdateTaskProposal {
  type: 'update_task'
  taskId: string
  updatedAt: string
  fields: OxanaUpdateField[]
  current: OxanaTaskSnapshot
  next: OxanaTaskSnapshot
  dueNeedsClarification?: boolean
  dueAmbiguousWeekday?: string
}

export interface OxanaChooseTaskMatch {
  id: string
  title: string
  dueAt: string | null
  dueLabel: string | null
  priority: OxanaTaskPriority
  status: OxanaTaskStatus
  updatedAt: string
}

export interface OxanaChooseTaskProposal {
  type: 'choose_task'
  query: string
  matches: OxanaChooseTaskMatch[]
  intend: UpdateTaskInput
  dueNeedsClarification?: boolean
  dueAmbiguousWeekday?: string
}

export type OxanaChatProposal =
  | OxanaUpdateTaskProposal
  | OxanaChooseTaskProposal

export interface OxanaProposeUpdateResult {
  ok: boolean
  kind: 'proposal' | 'choose' | 'rejected'
  payload: Record<string, unknown>
  proposal: OxanaChatProposal | null
}

export function oxanaProposeUpdateFunctionDefinition(): GigachatFunctionDefinition {
  return {
    name: OXANA_PROPOSE_UPDATE_TASK,
    description:
      'Найти существующую задачу владельца по точному названию и сформировать предложение изменений. Запись не изменяется и новая задача не создаётся. Если найдено несколько задач, не выбирай первую.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Точное название существующей задачи',
        },
        due: {
          type: 'string',
          description:
            'Новый срок, только если владелец его указал: today, tomorrow, monday-sunday или YYYY-MM-DD. Не передавай ISO datetime.',
        },
        priority: {
          type: 'string',
          enum: [...PRIORITIES],
          description: 'Новый приоритет, только если владелец его указал',
        },
        status: {
          type: 'string',
          enum: [...UPDATE_STATUSES],
          description: 'Новый статус, только если владелец его указал',
        },
        description: {
          type: 'string',
          description: 'Новое описание, только если владелец его явно указал',
        },
      },
      required: ['title'],
    },
    few_shot_examples: [
      {
        request:
          'ОКСИ, перенеси задачу «Тест создания задачи ОКСИ» на пятницу и установи высокий приоритет',
        params: {
          title: 'Тест создания задачи ОКСИ',
          due: 'friday',
          priority: 'high',
        },
      },
    ],
  }
}

export function isOxanaProposeUpdateFunction(name: string): boolean {
  return name === OXANA_PROPOSE_UPDATE_TASK
}

export function looksLikeTaskUpdateRequest(message: string): boolean {
  if (looksLikeTaskCreateRequest(message)) {
    return false
  }
  const text = message.toLowerCase()
  return (
    /(перенес|перенеси|измени|поменяй|сдвинь|обнови|передвинь|переименуй).{0,80}задач/i.test(
      text,
    ) ||
    /задач.{0,80}(перенес|измени|поменяй|сдвинь|обнови|передвинь|переименуй)/i.test(
      text,
    ) ||
    /(поставь|установи|поменять).{0,40}(срок|приоритет|статус).{0,80}задач/i.test(
      text,
    ) ||
    /задач.{0,80}(поставь|установи).{0,40}(срок|приоритет|статус|на\s+пятниц|на\s+завтра)/i.test(
      text,
    )
  )
}

export function extractPriorityHint(message: string): OxanaTaskPriority | null {
  const text = message.toLowerCase()
  if (/срочн|\burgent\b/.test(text)) {
    return 'urgent'
  }
  if (/высок|\bhigh\b/.test(text)) {
    return 'high'
  }
  if (/низк|\blow\b/.test(text)) {
    return 'low'
  }
  if (/обычн|нормальн|\bnormal\b/.test(text)) {
    return 'normal'
  }
  return null
}

export function findActiveTasksByTitle(
  tasks: OxanaTask[],
  title: string,
): OxanaTask[] {
  const needle = title.trim().toLowerCase()
  if (!needle) {
    return []
  }
  return tasks.filter(
    (task) => !task.archivedAt && task.title.trim().toLowerCase() === needle,
  )
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function parseOptionalPriority(
  value: unknown,
): { ok: true; value: OxanaTaskPriority | undefined } | { ok: false } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined }
  }
  if (typeof value !== 'string') {
    return { ok: false }
  }
  const raw = value.trim() as OxanaTaskPriority
  return PRIORITIES.includes(raw) ? { ok: true, value: raw } : { ok: false }
}

function parseOptionalStatus(
  value: unknown,
): { ok: true; value: OxanaTaskStatus | undefined } | { ok: false } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined }
  }
  if (typeof value !== 'string') {
    return { ok: false }
  }
  const raw = value.trim() as OxanaTaskStatus
  return UPDATE_STATUSES.includes(raw) ? { ok: true, value: raw } : { ok: false }
}

function snapshotTask(task: OxanaTask, timezone: string): OxanaTaskSnapshot {
  return {
    title: task.title,
    description: task.description,
    dueAt: task.dueAt,
    dueLabel: formatDueLabel(task.dueAt, timezone),
    priority: task.priority,
    status: task.status,
  }
}

function applyIntend(
  current: OxanaTaskSnapshot,
  intend: UpdateTaskInput,
  timezone: string,
  dueLabel?: string | null,
): OxanaTaskSnapshot {
  const next: OxanaTaskSnapshot = { ...current }
  if (intend.title !== undefined) {
    next.title = intend.title
  }
  if (Object.prototype.hasOwnProperty.call(intend, 'description')) {
    next.description = intend.description ?? null
  }
  if (Object.prototype.hasOwnProperty.call(intend, 'dueAt')) {
    next.dueAt = intend.dueAt ?? null
    next.dueLabel = dueLabel ?? formatDueLabel(next.dueAt, timezone)
  }
  if (intend.priority !== undefined) {
    next.priority = intend.priority
  }
  if (intend.status !== undefined) {
    next.status = intend.status
  }
  return next
}

function fieldsFromIntend(intend: UpdateTaskInput): OxanaUpdateField[] {
  const fields: OxanaUpdateField[] = []
  if (intend.title !== undefined) {
    fields.push('title')
  }
  if (Object.prototype.hasOwnProperty.call(intend, 'description')) {
    fields.push('description')
  }
  if (Object.prototype.hasOwnProperty.call(intend, 'dueAt')) {
    fields.push('dueAt')
  }
  if (intend.priority !== undefined) {
    fields.push('priority')
  }
  if (intend.status !== undefined) {
    fields.push('status')
  }
  return fields
}

export function buildUpdateTaskProposal(
  task: OxanaTask,
  intend: UpdateTaskInput,
  timezone: string,
  extras?: {
    dueLabel?: string | null
    dueNeedsClarification?: boolean
    dueAmbiguousWeekday?: string
  },
): OxanaUpdateTaskProposal {
  const current = snapshotTask(task, timezone)
  const fields = fieldsFromIntend(intend)
  if (
    extras?.dueNeedsClarification &&
    !fields.includes('dueAt')
  ) {
    fields.push('dueAt')
  }
  return {
    type: 'update_task',
    taskId: task.id,
    updatedAt: task.updatedAt,
    fields,
    current,
    next: applyIntend(current, intend, timezone, extras?.dueLabel),
    ...(extras?.dueNeedsClarification
      ? {
          dueNeedsClarification: true,
          dueAmbiguousWeekday: extras.dueAmbiguousWeekday,
        }
      : {}),
  }
}

async function resolveIntend(
  args: Record<string, unknown>,
  userMessage: string,
  timezone: string,
  now: Date,
): Promise<
  | {
      ok: true
      intend: UpdateTaskInput
      dueLabel: string | null
      dueAmbiguousWeekday: string | null
    }
  | { ok: false; error: string }
> {
  const intend: UpdateTaskInput = {}
  let dueLabel: string | null = null
  let dueAmbiguousWeekday: string | null = null
  const dueHint = extractDueHint(userMessage)
  if (dueHint) {
    const resolved = resolveProposedDueAt(dueHint, timezone, now)
    if (!resolved.ok) {
      if (resolved.error === 'due_ambiguous') {
        dueAmbiguousWeekday = resolved.weekday
      } else {
        return { ok: false, error: resolved.error }
      }
    } else {
      intend.dueAt = resolved.dueAt
      dueLabel = resolved.dueLabel
    }
  } else if (/\d{4}-\d{2}-\d{2}/.test(userMessage)) {
    const resolved = resolveProposedDueAt(
      coerceDueInput(args.due ?? args.dueAt ?? args.due_at),
      timezone,
      now,
    )
    if (!resolved.ok) {
      return { ok: false, error: resolved.error }
    }
    if (resolved.dueAt) {
      intend.dueAt = resolved.dueAt
      dueLabel = resolved.dueLabel
    }
  }

  const priorityHint = extractPriorityHint(userMessage)
  if (priorityHint) {
    intend.priority = priorityHint
  } else {
    const parsed = parseOptionalPriority(args.priority)
    if (!parsed.ok) {
      return { ok: false, error: 'invalid_priority' }
    }
  }

  const statusMentioned = /статус|в работу|открой/.test(userMessage.toLowerCase())
  if (statusMentioned) {
    const parsed = parseOptionalStatus(args.status)
    if (!parsed.ok) {
      return { ok: false, error: 'invalid_status' }
    }
    if (parsed.value) {
      intend.status = parsed.value
    } else if (/в работу/.test(userMessage.toLowerCase())) {
      intend.status = 'in_progress'
    } else if (/открой/.test(userMessage.toLowerCase())) {
      intend.status = 'open'
    }
  }

  if (/описан|текст задач/.test(userMessage.toLowerCase())) {
    const description = resolveProposalDescription(
      userMessage,
      clampText(args.description, 4000) || null,
      extractQuotedTitle(userMessage) ?? '',
    )
    if (description) {
      intend.description = description
    }
  }

  if (/переименуй|назови задач/.test(userMessage.toLowerCase())) {
    const quotes = [...userMessage.matchAll(/[«“„"']([^«“„"'»”\n]{2,200})[»”"']/g)]
    const nextTitle = clampText(quotes[1]?.[1], 200)
    if (nextTitle) {
      intend.title = nextTitle
    }
  }

  if (fieldsFromIntend(intend).length === 0 && !dueAmbiguousWeekday) {
    return { ok: false, error: 'validation_failed' }
  }
  return { ok: true, intend, dueLabel, dueAmbiguousWeekday }
}

function compactMatch(task: OxanaTask, timezone: string) {
  return {
    title: titleForExternalModel(task.title),
    dueLabel: formatDueLabel(task.dueAt, timezone),
    priority: task.priority,
    status: task.status,
  }
}

export async function executeOxanaProposeUpdateTask(
  rawArgs: unknown,
  context: {
    repo: OxanaRepository
    workspaceId: string
    userId: string
    userMessage: string
    now?: Date
  },
): Promise<OxanaProposeUpdateResult> {
  const args = asObject(rawArgs)
  const query =
    extractQuotedTitle(context.userMessage) ||
    clampText(args.title ?? args.taskTitle, 200)
  if (!query) {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: {
        ok: false,
        error: 'title_required',
        created: false,
        updated: false,
      },
    }
  }

  const settings = await context.repo.getSettings(
    context.workspaceId,
    context.userId,
  )
  const now = context.now ?? new Date()
  const intendResult = await resolveIntend(
    args,
    context.userMessage,
    settings.timezone,
    now,
  )
  if (!intendResult.ok) {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: {
        ok: false,
        error: intendResult.error,
        created: false,
        updated: false,
      },
    }
  }

  let tasks: OxanaTask[]
  try {
    tasks = await context.repo.listTasks(context.workspaceId)
  } catch {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: {
        ok: false,
        error: 'data_unavailable',
        created: false,
        updated: false,
      },
    }
  }

  const matches = findActiveTasksByTitle(tasks, query)
  if (matches.length === 0) {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: {
        ok: false,
        error: 'task_not_found',
        created: false,
        updated: false,
        note: 'Do not create a new task. Ask the owner for a more exact title.',
      },
    }
  }

  if (matches.length > 1) {
    const proposal: OxanaChooseTaskProposal = {
      type: 'choose_task',
      query,
      intend: intendResult.intend,
      dueNeedsClarification: Boolean(intendResult.dueAmbiguousWeekday),
      dueAmbiguousWeekday: intendResult.dueAmbiguousWeekday ?? undefined,
      matches: matches.map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        dueLabel: formatDueLabel(task.dueAt, settings.timezone),
        priority: task.priority,
        status: task.status,
        updatedAt: task.updatedAt,
      })),
    }
    return {
      ok: false,
      kind: 'choose',
      proposal,
      payload: {
        ok: false,
        error: 'task_ambiguous',
        created: false,
        updated: false,
        matches: matches.map((task) => compactMatch(task, settings.timezone)),
        note: 'Several tasks have this title. Do not pick the first. The owner will choose in the UI.',
      },
    }
  }

  const task = matches[0]
  if (!task) {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: {
        ok: false,
        error: 'task_not_found',
        created: false,
        updated: false,
      },
    }
  }

  const proposal = buildUpdateTaskProposal(
    task,
    intendResult.intend,
    settings.timezone,
    {
      dueLabel: intendResult.dueLabel,
      dueNeedsClarification: Boolean(intendResult.dueAmbiguousWeekday),
      dueAmbiguousWeekday: intendResult.dueAmbiguousWeekday ?? undefined,
    },
  )
  return {
    ok: true,
    kind: 'proposal',
    proposal,
    payload: {
      ok: true,
      created: false,
      updated: false,
      proposed: true,
      title: titleForExternalModel(task.title),
      dueLabel: proposal.next.dueLabel,
      priority: proposal.next.priority,
      note: 'UNTRUSTED_PROPOSAL. Task is not updated until the owner confirms in the UI. Do not create a new task.',
    },
  }
}
