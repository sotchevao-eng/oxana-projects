import type { OxanaAiProvider } from './aiAdapter.js'
import {
  executeOxanaGetTaskByTitle,
  isOxanaGetTaskByTitleFunction,
  looksLikeTaskReadFollowUp,
  looksLikeTaskReadRequest,
  oxanaGetTaskByTitleFunctionDefinition,
} from './aiGetTask.js'
import {
  executeOxanaProposeCreateTask,
  isOxanaProposeFunction,
  looksLikeTaskCreateRequest,
  OXANA_PROPOSAL_REPLY,
  oxanaProposeFunctionDefinition,
  type OxanaCreateTaskProposal,
} from './aiPropose.js'
import {
  executeOxanaProposeUpdateTask,
  isOxanaProposeUpdateFunction,
  looksLikeTaskUpdateRequest,
  OXANA_CHOOSE_TASK_REPLY,
  OXANA_TASK_NOT_FOUND_REPLY,
  OXANA_UPDATE_PROPOSAL_REPLY,
  oxanaProposeUpdateFunctionDefinition,
  type OxanaChatProposal,
} from './aiProposeUpdate.js'
import { executeOxanaReadFunction, oxanaReadFunctionDefinitions } from './aiTools.js'
import {
  historyAsGigachatMessages,
  ownerTextsFromHistory,
  type OxanaChatHistoryItem,
} from './chatHistory.js'
import { OxanaAiNotConfiguredError, OxanaAiUnavailableError } from './errors.js'
import {
  MAX_FUNCTION_ROUNDS,
  MAX_REPLY_CHARS,
  OXANA_CHAT_SYSTEM_PROMPT,
  OXANA_DATA_UNAVAILABLE_REPLY,
  type GigachatChatMessage,
  type GigachatFunctionDefinition,
} from './gigachatClient.js'
import { dueAmbiguousReply, OXANA_INVALID_DUE_REPLY } from './taskDue.js'
import type { OxanaRepository } from './types.js'

export type OxanaCabinetProposal = OxanaCreateTaskProposal | OxanaChatProposal

export function cabinetChatFunctions(message: string): GigachatFunctionDefinition[] {
  if (looksLikeTaskUpdateRequest(message)) {
    return [oxanaProposeUpdateFunctionDefinition()]
  }
  if (looksLikeTaskCreateRequest(message)) {
    return [oxanaProposeFunctionDefinition()]
  }
  if (looksLikeTaskReadRequest(message) || looksLikeTaskReadFollowUp(message)) {
    return [oxanaGetTaskByTitleFunctionDefinition()]
  }
  return [
    oxanaGetTaskByTitleFunctionDefinition(),
    ...oxanaReadFunctionDefinitions(),
  ]
}

export async function runOxanaCabinetChat(options: {
  ai: OxanaAiProvider
  repo: OxanaRepository
  userId: string
  workspaceId: string
  message: string
  history?: OxanaChatHistoryItem[]
  now?: Date
}): Promise<{ reply: string; proposal?: OxanaCabinetProposal }> {
  if (!options.ai.isConfigured()) {
    throw new OxanaAiNotConfiguredError()
  }

  const history = options.history ?? []
  const ownerTexts = ownerTextsFromHistory(history)
  const functions = cabinetChatFunctions(options.message)
  const allowed = new Set(functions.map((item) => item.name))
  const messages: GigachatChatMessage[] = [
    { role: 'system', content: OXANA_CHAT_SYSTEM_PROMPT },
    ...historyAsGigachatMessages(history),
    { role: 'user', content: options.message },
  ]
  let dataFailed = false
  let proposal: OxanaCabinetProposal | undefined
  let notFound = false
  let invalidDue = false
  let dueAmbiguousWeekday: string | null = null
  let taskReadReply: string | null = null

  const runGetTaskByTitle = async (rawArgs: unknown) => {
    const tool = await executeOxanaGetTaskByTitle(rawArgs, {
      repo: options.repo,
      workspaceId: options.workspaceId,
      userId: options.userId,
      userMessage: options.message,
      ownerTexts,
    })
    if (tool.kind === 'data_error') {
      dataFailed = true
    }
    if (tool.ownerReply) {
      taskReadReply = tool.ownerReply
    }
    return tool
  }

  for (let round = 0; round <= MAX_FUNCTION_ROUNDS; round += 1) {
    const result = await options.ai.complete({
      messages,
      functions,
      functionCall: 'auto',
    })

    if (result.finishReason === 'error') {
      return finalizeChat({
        proposal,
        notFound,
        invalidDue,
        dataFailed,
        dueAmbiguousWeekday,
        taskReadReply,
        reply: '',
        source: 'error',
      })
    }

    if (result.functionCall) {
      if (round === MAX_FUNCTION_ROUNDS) {
        return finalizeChat({
          proposal,
          notFound,
          invalidDue,
          dataFailed,
          dueAmbiguousWeekday,
          taskReadReply,
          reply: '',
          source: 'error',
        })
      }

      const name = result.functionCall.name
      let payload: Record<string, unknown> = {
        ok: false,
        error: 'unknown_function',
        created: false,
        updated: false,
      }

      if (isOxanaProposeFunction(name) && allowed.has(name)) {
        const tool = await executeOxanaProposeCreateTask(
          result.functionCall.arguments,
          {
            repo: options.repo,
            workspaceId: options.workspaceId,
            userId: options.userId,
            userMessage: options.message,
            now: options.now,
          },
        )
        payload = tool.payload
        if (tool.proposal) {
          proposal = tool.proposal
        }
        if (tool.payload.error === 'due_ambiguous') {
          dueAmbiguousWeekday = String(tool.payload.weekday ?? 'этот день недели')
        }
      } else if (isOxanaProposeUpdateFunction(name) && allowed.has(name)) {
        const tool = await executeOxanaProposeUpdateTask(
          result.functionCall.arguments,
          {
            repo: options.repo,
            workspaceId: options.workspaceId,
            userId: options.userId,
            userMessage: options.message,
            now: options.now,
          },
        )
        payload = tool.payload
        if (tool.proposal) {
          proposal = tool.proposal
        }
        if (tool.payload.error === 'task_not_found') {
          notFound = true
        }
        if (
          tool.proposal?.type === 'update_task' &&
          tool.proposal.dueAmbiguousWeekday
        ) {
          dueAmbiguousWeekday = tool.proposal.dueAmbiguousWeekday
        }
      } else if (isOxanaGetTaskByTitleFunction(name) && allowed.has(name)) {
        const tool = await runGetTaskByTitle(result.functionCall.arguments)
        payload = tool.payload
        if (tool.ownerReply) {
          return finalizeChat({
            proposal,
            notFound,
            invalidDue,
            dataFailed,
            dueAmbiguousWeekday,
            taskReadReply: tool.ownerReply,
            reply: tool.ownerReply,
            source: 'stop',
          })
        }
      } else if (allowed.has(name)) {
        const tool = await executeOxanaReadFunction(
          name,
          result.functionCall.arguments,
          {
            repo: options.repo,
            workspaceId: options.workspaceId,
            userId: options.userId,
          },
        )
        payload = tool.payload
        if (tool.kind === 'data_error') {
          dataFailed = true
        }
      }

      if (payload.error === 'invalid_due_at') {
        invalidDue = true
      }

      messages.push({
        role: 'assistant',
        content: result.content,
        function_call: result.functionCall,
        functions_state_id: result.functionsStateId ?? undefined,
      })
      messages.push({
        role: 'function',
        name,
        content: JSON.stringify(payload),
      })
      continue
    }

    if (looksLikeTaskReadRequest(options.message) && !taskReadReply && !proposal) {
      const tool = await runGetTaskByTitle({})
      if (tool.ownerReply) {
        return finalizeChat({
          proposal,
          notFound,
          invalidDue,
          dataFailed,
          dueAmbiguousWeekday,
          taskReadReply: tool.ownerReply,
          reply: tool.ownerReply,
          source: 'stop',
        })
      }
    }

    const reply = result.content.trim()
    return finalizeChat({
      proposal,
      notFound,
      invalidDue,
      dataFailed,
      dueAmbiguousWeekday,
      taskReadReply,
      reply,
      source: 'stop',
    })
  }

  return finalizeChat({
    proposal,
    notFound,
    invalidDue,
    dataFailed,
    dueAmbiguousWeekday,
    taskReadReply,
    reply: '',
    source: 'error',
  })
}

function finalizeChat(options: {
  proposal?: OxanaCabinetProposal
  notFound: boolean
  invalidDue: boolean
  dataFailed: boolean
  dueAmbiguousWeekday: string | null
  taskReadReply: string | null
  reply: string
  source: 'stop' | 'error'
}): { reply: string; proposal?: OxanaCabinetProposal } {
  if (options.proposal?.type === 'create_task') {
    return { reply: OXANA_PROPOSAL_REPLY, proposal: options.proposal }
  }
  if (options.proposal?.type === 'update_task') {
    const reply = options.proposal.dueNeedsClarification
      ? dueAmbiguousReply(options.proposal.dueAmbiguousWeekday)
      : OXANA_UPDATE_PROPOSAL_REPLY
    return { reply, proposal: options.proposal }
  }
  if (options.proposal?.type === 'choose_task') {
    const reply = options.proposal.dueNeedsClarification
      ? `${OXANA_CHOOSE_TASK_REPLY} ${dueAmbiguousReply(options.proposal.dueAmbiguousWeekday)}`
      : OXANA_CHOOSE_TASK_REPLY
    return { reply, proposal: options.proposal }
  }
  if (options.taskReadReply) {
    return { reply: options.taskReadReply.slice(0, MAX_REPLY_CHARS) }
  }
  if (options.notFound) {
    return { reply: OXANA_TASK_NOT_FOUND_REPLY }
  }
  if (options.invalidDue) {
    return { reply: OXANA_INVALID_DUE_REPLY }
  }
  if (options.dueAmbiguousWeekday) {
    return { reply: dueAmbiguousReply(options.dueAmbiguousWeekday) }
  }
  if (!options.reply) {
    if (options.source === 'error' || options.dataFailed) {
      return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
    }
    throw new OxanaAiUnavailableError()
  }
  if (options.dataFailed) {
    return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
  }
  return { reply: options.reply.slice(0, MAX_REPLY_CHARS) }
}
