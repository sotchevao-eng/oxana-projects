import { titleForExternalModel } from './aiTools.js'
import type { GigachatFunctionDefinition } from './gigachatClient.js'
import { resolveProposedDueAt } from './taskDue.js'
import type { OxanaRepository, OxanaTaskPriority } from './types.js'
import { clampText, isUuid } from './validation.js'

export const OXANA_PROPOSE_CREATE_TASK = 'oxana_propose_create_task'

const PRIORITIES: readonly OxanaTaskPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
]

export const OXANA_PROPOSAL_REPLY = 'Черновик задачи подготовлен'

export interface OxanaCreateTaskProposal {
  type: 'create_task'
  title: string
  description: string | null
  dueAt: string | null
  dueLabel: string | null
  priority: OxanaTaskPriority
  projectId: string | null
  projectTitle: string | null
}

export interface OxanaProposeResult {
  ok: boolean
  kind: 'proposal' | 'rejected'
  payload: Record<string, unknown>
  proposal: OxanaCreateTaskProposal | null
}

export function oxanaProposeFunctionDefinition(): GigachatFunctionDefinition {
  return {
    name: OXANA_PROPOSE_CREATE_TASK,
    description:
      'Сформировать предложение новой задачи. Запись не создаётся. Владелец подтвердит кнопкой в интерфейсе.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Название задачи',
        },
        description: {
          type: 'string',
          description: 'Краткое описание, только если владелец его явно указал',
        },
        due: {
          type: 'string',
          description:
            'Срок: today, tomorrow, none или календарная дата YYYY-MM-DD. Не передавай ISO datetime.',
        },
        priority: {
          type: 'string',
          enum: [...PRIORITIES],
          description: 'Приоритет задачи',
        },
        projectTitle: {
          type: 'string',
          description: 'Название существующего проекта владельца, если указано',
        },
      },
      required: ['title'],
    },
    few_shot_examples: [
      {
        request:
          'ОКСИ, создай задачу на завтра: проверить документы поставщика. Приоритет высокий',
        params: {
          title: 'Проверить документы поставщика',
          due: 'tomorrow',
          priority: 'high',
        },
      },
    ],
  }
}

export function isOxanaProposeFunction(name: string): boolean {
  return name === OXANA_PROPOSE_CREATE_TASK
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function parsePriority(
  value: unknown,
): { ok: true; value: OxanaTaskPriority } | { ok: false } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: 'normal' }
  }
  if (typeof value !== 'string') {
    return { ok: false }
  }
  const raw = value.trim() as OxanaTaskPriority
  return PRIORITIES.includes(raw) ? { ok: true, value: raw } : { ok: false }
}

async function resolveProject(
  repo: OxanaRepository,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<
  | { ok: true; projectId: string | null; projectTitle: string | null }
  | { ok: false; error: string }
> {
  const projectIdRaw = clampText(args.projectId ?? args.project_id, 36)
  const projectTitleRaw = clampText(args.projectTitle ?? args.project_title, 200)
  const projects = await repo.listProjects(workspaceId)

  if (projectIdRaw) {
    if (!isUuid(projectIdRaw)) {
      return { ok: false, error: 'invalid_project_id' }
    }
    const match = projects.find((item) => item.id === projectIdRaw)
    if (!match) {
      return { ok: false, error: 'invalid_project_id' }
    }
    return { ok: true, projectId: match.id, projectTitle: match.title }
  }

  if (!projectTitleRaw) {
    return { ok: true, projectId: null, projectTitle: null }
  }

  const exact = projects.filter(
    (item) => item.title.toLowerCase() === projectTitleRaw.toLowerCase(),
  )
  if (exact.length === 1 && exact[0]) {
    return { ok: true, projectId: exact[0].id, projectTitle: exact[0].title }
  }
  if (exact.length > 1) {
    return { ok: false, error: 'project_ambiguous' }
  }
  return { ok: false, error: 'invalid_project_id' }
}

export async function executeOxanaProposeCreateTask(
  rawArgs: unknown,
  context: {
    repo: OxanaRepository
    workspaceId: string
    userId: string
    now?: Date
  },
): Promise<OxanaProposeResult> {
  const args = asObject(rawArgs)
  const title = clampText(args.title, 200)
  if (!title) {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: { ok: false, error: 'title_required', created: false },
    }
  }

  const priority = parsePriority(args.priority)
  if (!priority.ok) {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: { ok: false, error: 'invalid_priority', created: false },
    }
  }

  const settings = await context.repo.getSettings(
    context.workspaceId,
    context.userId,
  )
  const due = resolveProposedDueAt(
    args.due ?? args.dueAt ?? args.due_at,
    settings.timezone,
    context.now ?? new Date(),
  )
  if (!due.ok) {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: { ok: false, error: due.error, created: false },
    }
  }

  let project: Awaited<ReturnType<typeof resolveProject>>
  try {
    project = await resolveProject(context.repo, context.workspaceId, args)
  } catch {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: { ok: false, error: 'data_unavailable', created: false },
    }
  }
  if (!project.ok) {
    return {
      ok: false,
      kind: 'rejected',
      proposal: null,
      payload: { ok: false, error: project.error, created: false },
    }
  }

  const description = clampText(args.description, 4000) || null
  const proposal: OxanaCreateTaskProposal = {
    type: 'create_task',
    title,
    description,
    dueAt: due.dueAt,
    dueLabel: due.dueLabel,
    priority: priority.value,
    projectId: project.projectId,
    projectTitle: project.projectTitle,
  }

  return {
    ok: true,
    kind: 'proposal',
    proposal,
    payload: {
      ok: true,
      created: false,
      proposed: true,
      title: titleForExternalModel(title),
      dueLabel: proposal.dueLabel,
      priority: proposal.priority,
      projectTitle: proposal.projectTitle
        ? titleForExternalModel(proposal.projectTitle)
        : null,
      note: 'UNTRUSTED_PROPOSAL. Task is not created until the owner confirms in the UI.',
    },
  }
}
