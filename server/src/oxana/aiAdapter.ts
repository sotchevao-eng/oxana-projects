import { OxanaAiNotConfiguredError } from './errors.js'

export interface OxanaAiChatRequest {
  workspaceId: string
  userId: string
  message: string
}

export interface OxanaAiProvider {
  id: 'gigachat'
  isConfigured(): boolean
  chat(request: OxanaAiChatRequest): Promise<never>
}

/**
 * Russian AI adapter contract. This stage does not call a live model.
 * Do not treat a missing provider as a successful assistant reply.
 */
export class GigaChatAdapter implements OxanaAiProvider {
  readonly id = 'gigachat' as const

  isConfigured(): boolean {
    return Boolean(
      process.env.GIGACHAT_AUTH_KEY?.trim() ||
        process.env.GIGACHAT_CLIENT_ID?.trim(),
    )
  }

  async chat(_request: OxanaAiChatRequest): Promise<never> {
    throw new OxanaAiNotConfiguredError()
  }
}

export const oxanaAiProvider: OxanaAiProvider = new GigaChatAdapter()
