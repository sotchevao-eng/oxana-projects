import type { OxanaAiProvider } from './aiAdapter.js'
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
}): Promise<{ reply: string }> {
  if (!options.ai.isConfigured()) {
    throw new OxanaAiNotConfiguredError()
  }

  const functions = oxanaReadFunctionDefinitions()
  const messages: GigachatChatMessage[] = [
    { role: 'system', content: OXANA_CHAT_SYSTEM_PROMPT },
    { role: 'user', content: options.message },
  ]
  let dataFailed = false

  for (let round = 0; round <= MAX_FUNCTION_ROUNDS; round += 1) {
    const result = await options.ai.complete({
      messages,
      functions,
      functionCall: 'auto',
    })

    if (result.finishReason === 'error') {
      return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
    }

    if (result.functionCall) {
      if (round === MAX_FUNCTION_ROUNDS) {
        return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
      }
      const tool = await executeOxanaReadFunction(
        result.functionCall.name,
        result.functionCall.arguments,
        {
          repo: options.repo,
          workspaceId: options.workspaceId,
          userId: options.userId,
        },
      )
      if (tool.kind === 'data_error') {
        dataFailed = true
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
        content: JSON.stringify(tool.payload),
      })
      continue
    }

    const reply = result.content.trim()
    if (!reply) {
      throw new OxanaAiUnavailableError()
    }
    if (dataFailed) {
      return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
    }
    return { reply: reply.slice(0, MAX_REPLY_CHARS) }
  }

  return { reply: OXANA_DATA_UNAVAILABLE_REPLY }
}
