import type { OxanaAiProvider } from './aiAdapter.js'
import {
  executeOxanaProposeCreateTask,
  isOxanaProposeFunction,
  OXANA_PROPOSAL_REPLY,
  oxanaProposeFunctionDefinition,
  type OxanaCreateTaskProposal,
} from './aiPropose.js'
import { executeOxanaReadFunction, oxanaReadFunctionDefinitions } from './aiTools.js'
import { OxanaAiNotConfiguredError, OxanaAiUnavailableError } from './errors.js'
import {
  MAX_FUNCTION_ROUNDS,
  MAX_REPLY_CHARS,
  OXANA_CHAT_SYSTEM_PROMPT,
  OXANA_DATA_UNAVAILABLE_REPLY,
  type GigachatChatMessage,
} from './gigachatClient.js'
import type { OxanaRepository } from './types.js'

export async function runOxanaCabinetChat(options: {
  ai: OxanaAiProvider
  repo: OxanaRepository
  userId: string
  workspaceId: string
  message: string
  now?: Date
}): Promise<{ reply: string; proposal?: OxanaCreateTaskProposal }> {
  if (!options.ai.isConfigured()) {
    throw new OxanaAiNotConfiguredError()
  }

  const functions = [
    ...oxanaReadFunctionDefinitions(),
    oxanaProposeFunctionDefinition(),
  ]
  const messages: GigachatChatMessage[] = [
    { role: 'system', content: OXANA_CHAT_SYSTEM_PROMPT },
    { role: 'user', content: options.message },
  ]
  let dataFailed = false
  let proposal: OxanaCreateTaskProposal | undefined

  for (let round = 0; round <= MAX_FUNCTION_ROUNDS; round += 1) {
    const result = await options.ai.complete({
      messages,
      functions,
      functionCall: 'auto',
    })

    if (result.finishReason === 'error') {
      if (proposal) {
        return { reply: OXANA_PROPOSAL_REPLY, proposal }
      }
      return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
    }

    if (result.functionCall) {
      if (round === MAX_FUNCTION_ROUNDS) {
        if (proposal) {
          return { reply: OXANA_PROPOSAL_REPLY, proposal }
        }
        return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
      }

      let payload: Record<string, unknown>
      if (isOxanaProposeFunction(result.functionCall.name)) {
        const tool = await executeOxanaProposeCreateTask(
          result.functionCall.arguments,
          {
            repo: options.repo,
            workspaceId: options.workspaceId,
            userId: options.userId,
            now: options.now,
          },
        )
        payload = tool.payload
        if (tool.proposal) {
          proposal = tool.proposal
        }
      } else {
        const tool = await executeOxanaReadFunction(
          result.functionCall.name,
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

      messages.push({
        role: 'assistant',
        content: result.content,
        function_call: result.functionCall,
        functions_state_id: result.functionsStateId ?? undefined,
      })
      messages.push({
        role: 'function',
        name: result.functionCall.name,
        content: JSON.stringify(payload),
      })
      continue
    }

    const reply = result.content.trim()
    if (proposal) {
      return { reply: OXANA_PROPOSAL_REPLY, proposal }
    }
    if (!reply) {
      throw new OxanaAiUnavailableError()
    }
    if (dataFailed) {
      return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
    }
    return {
      reply: reply.slice(0, MAX_REPLY_CHARS),
    }
  }

  if (proposal) {
    return { reply: OXANA_PROPOSAL_REPLY, proposal }
  }
  return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
}
