import { OxanaAiNotConfiguredError } from './errors.js'
import {
  GigachatClient,
  type GigachatCompletionInput,
  type GigachatCompletionResult,
  type GigachatTransport,
} from './gigachatClient.js'

export interface OxanaAiChatRequest {
  message: string
}

export interface OxanaAiChatResult {
  reply: string
}

export interface OxanaAiProvider {
  id: 'gigachat'
  isConfigured(): boolean
  chat(request: OxanaAiChatRequest): Promise<OxanaAiChatResult>
  complete(input: GigachatCompletionInput): Promise<GigachatCompletionResult>
}

export class GigaChatAdapter implements OxanaAiProvider {
  readonly id = 'gigachat' as const
  private readonly client: GigachatClient

  constructor(options: {
    env?: NodeJS.ProcessEnv
    transport?: GigachatTransport
  } = {}) {
    this.client = new GigachatClient(options.env ?? process.env, options.transport)
  }

  isConfigured(): boolean {
    return this.client.isConfigured()
  }

  async chat(request: OxanaAiChatRequest): Promise<OxanaAiChatResult> {
    if (!this.isConfigured()) {
      throw new OxanaAiNotConfiguredError()
    }
    const reply = await this.client.chat(request.message)
    return { reply }
  }

  async complete(
    input: GigachatCompletionInput,
  ): Promise<GigachatCompletionResult> {
    if (!this.isConfigured()) {
      throw new OxanaAiNotConfiguredError()
    }
    return this.client.complete(input)
  }
}

export const oxanaAiProvider: OxanaAiProvider = new GigaChatAdapter()
