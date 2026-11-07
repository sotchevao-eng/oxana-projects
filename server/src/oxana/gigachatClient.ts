import { randomUUID } from 'node:crypto'
import https from 'node:https'
import tls from 'node:tls'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { SERVER_ROOT } from '../db.js'
import { safeErrorCode, safeErrorName } from '../safeLog.js'
import {
  OxanaAiAuthError,
  OxanaAiNotConfiguredError,
  OxanaAiRateLimitError,
  OxanaAiUnavailableError,
} from './errors.js'

export const GIGACHAT_OAUTH_URL =
  'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
export const GIGACHAT_CHAT_URL = 'https://api.giga.chat/v1/chat/completions'
export const GIGACHAT_MODELS_URL = 'https://api.giga.chat/v1/models'

const ALLOWED_SCOPES = new Set([
  'GIGACHAT_API_PERS',
  'GIGACHAT_API_B2B',
  'GIGACHAT_API_CORP',
])

const DEFAULT_MODEL = 'GigaChat'
const MODEL_RE = /^GigaChat(?:-[A-Za-z0-9]+)*$/
const USER_AGENT = 'OXANA-PII-API/0.1'
const OAUTH_TIMEOUT_MS = 15_000
const CHAT_TIMEOUT_MS = 30_000
const MODELS_TIMEOUT_MS = 15_000
const TOKEN_REFRESH_SKEW_MS = 60_000
const MAX_REPLY_CHARS = 8_000
const MAX_MODEL_IDS = 50

export const OXANA_CHAT_SYSTEM_PROMPT = [
  'Ты ОКСИ — текстовый помощник кабинета OXANA PROJECTS.',
  'Отвечай по-русски кратко и по делу.',
  'У тебя нет доступа к задачам, проектам, событиям, базе данных, файлам и персональным данным.',
  'Нельзя создавать, изменять или удалять задачи, проекты и события.',
  'Не проси пароли, токены, ключи и персональные данные клиентов.',
  'Если просят действие с задачами, проектами или календарём, скажи, что это будет отдельный этап с подтверждением владельца.',
].join(' ')

export interface GigachatTransportRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
  timeoutMs: number
}

export interface GigachatTransportResponse {
  status: number
  text: string
}

export type GigachatTransport = (
  request: GigachatTransportRequest,
) => Promise<GigachatTransportResponse>

interface CachedToken {
  accessToken: string
  expiresAtMs: number
}

function logGigachat(event: Record<string, unknown>): void {
  console.info(JSON.stringify(event))
}

function normalizeAuthKey(value: string): string {
  return value.replace(/^Basic\s+/i, '').trim()
}

function readAuthKey(env: NodeJS.ProcessEnv): string | null {
  const ready = env.GIGACHAT_AUTH_KEY?.trim()
  if (ready) {
    return normalizeAuthKey(ready)
  }
  const clientId = env.GIGACHAT_CLIENT_ID?.trim()
  const clientSecret = env.GIGACHAT_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return null
  }
  return Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')
}

export function isGigachatConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(readAuthKey(env))
}

export function isGigachatDiagEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OXANA_GIGACHAT_DIAG?.trim() === '1'
}

export function resolveGigachatScope(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = (env.GIGACHAT_SCOPE ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_')
  if (ALLOWED_SCOPES.has(raw)) {
    return raw
  }
  if (raw === 'PERS' || raw === 'B2B' || raw === 'CORP') {
    return `GIGACHAT_API_${raw}`
  }
  return 'GIGACHAT_API_PERS'
}

export function resolveGigachatModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.GIGACHAT_MODEL?.trim() || DEFAULT_MODEL
  return MODEL_RE.test(raw) ? raw : DEFAULT_MODEL
}

function resolveCaFile(raw: string | undefined): string | undefined {
  const extraPath = raw?.trim()
  if (!extraPath) {
    return undefined
  }
  const absolute = isAbsolute(extraPath)
    ? extraPath
    : resolve(SERVER_ROOT, extraPath)
  return readFileSync(absolute, 'utf8')
}

export function gigachatTlsOptions(
  env: NodeJS.ProcessEnv = process.env,
): { rejectUnauthorized: true; ca?: string[] } {
  const extras = [
    resolveCaFile(env.GIGACHAT_CA_FILE),
    env.GIGACHAT_CA_FILE?.trim() ? resolveCaFile(env.NODE_EXTRA_CA_CERTS) : undefined,
  ].filter((item): item is string => Boolean(item))
  if (extras.length === 0) {
    return { rejectUnauthorized: true }
  }
  return {
    rejectUnauthorized: true,
    ca: [...tls.rootCertificates, ...extras],
  }
}

function mapHttpError(
  status: number,
  kind: 'oauth' | 'chat' | 'models',
): never {
  if (status === 401 || status === 403) {
    throw new OxanaAiAuthError()
  }
  if (status === 402 || status === 429) {
    throw new OxanaAiRateLimitError()
  }
  if (status === 413) {
    throw new OxanaAiUnavailableError()
  }
  logGigachat({
    event: 'oxana_gigachat',
    ok: false,
    stage: kind,
    status,
    error_code:
      status >= 500 ? 'ai_unavailable' : `ai_${kind}_http`,
  })
  throw new OxanaAiUnavailableError()
}

function parseExpiresAt(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Date.now() + 30 * 60_000
  }
  return numeric > 1e12 ? numeric : numeric * 1000
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function parseModelIds(text: string): string[] {
  const payload = parseJson(text)
  const data = Array.isArray(payload?.data) ? payload.data : null
  if (!data) {
    logGigachat({
      event: 'oxana_gigachat',
      ok: false,
      stage: 'models',
      error_code: 'ai_models_http',
    })
    throw new OxanaAiUnavailableError()
  }
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of data) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const id = String((item as { id?: unknown }).id ?? '').trim()
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    ids.push(id)
    if (ids.length >= MAX_MODEL_IDS) {
      break
    }
  }
  return ids
}

export async function defaultGigachatTransport(
  request: GigachatTransportRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GigachatTransportResponse> {
  const url = new URL(request.url)
  const agent = new https.Agent(gigachatTlsOptions(env))
  return await new Promise((resolveRequest, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: request.headers,
        agent,
        servername: url.hostname,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on('end', () => {
          resolveRequest({
            status: response.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.setTimeout(request.timeoutMs, () => {
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
    })
    req.on('error', reject)
    if (request.body) {
      req.write(request.body)
    }
    req.end()
  })
}

export class GigachatClient {
  private cached: CachedToken | null = null

  private readonly transport: GigachatTransport

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    transport?: GigachatTransport,
  ) {
    this.transport =
      transport ?? ((request) => defaultGigachatTransport(request, env))
  }

  isConfigured(): boolean {
    return isGigachatConfigured(this.env)
  }

  async listModels(): Promise<string[]> {
    const authKey = readAuthKey(this.env)
    if (!authKey) {
      throw new OxanaAiNotConfiguredError()
    }
    const token = await this.getAccessToken(authKey)
    let response: GigachatTransportResponse
    try {
      response = await this.transport({
        url: GIGACHAT_MODELS_URL,
        method: 'GET',
        timeoutMs: MODELS_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
      })
    } catch (error) {
      logGigachat({
        event: 'oxana_gigachat',
        ok: false,
        stage: 'models',
        error_code: safeErrorCode(error) ?? 'ai_unavailable',
        error_name: safeErrorName(error),
      })
      throw new OxanaAiUnavailableError()
    }
    if (response.status === 401 || response.status === 403) {
      this.cached = null
      mapHttpError(response.status, 'models')
    }
    if (response.status !== 200) {
      mapHttpError(response.status, 'models')
    }
    const ids = parseModelIds(response.text)
    logGigachat({
      event: 'oxana_gigachat',
      ok: true,
      stage: 'models',
      count: ids.length,
    })
    return ids
  }

  async chat(message: string): Promise<string> {
    const authKey = readAuthKey(this.env)
    if (!authKey) {
      throw new OxanaAiNotConfiguredError()
    }
    const token = await this.getAccessToken(authKey)
    const body = JSON.stringify({
      model: resolveGigachatModel(this.env),
      stream: false,
      messages: [
        { role: 'system', content: OXANA_CHAT_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    })
    let response: GigachatTransportResponse
    try {
      response = await this.transport({
        url: GIGACHAT_CHAT_URL,
        method: 'POST',
        timeoutMs: CHAT_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
          'User-Agent': USER_AGENT,
        },
        body,
      })
    } catch (error) {
      logGigachat({
        event: 'oxana_gigachat',
        ok: false,
        stage: 'chat',
        error_code: safeErrorCode(error) ?? 'ai_unavailable',
        error_name: safeErrorName(error),
      })
      throw new OxanaAiUnavailableError()
    }
    if (response.status === 401 || response.status === 403) {
      this.cached = null
      mapHttpError(response.status, 'chat')
    }
    if (response.status !== 200) {
      mapHttpError(response.status, 'chat')
    }
    const payload = parseJson(response.text)
    const choices = Array.isArray(payload?.choices) ? payload.choices : []
    const first = choices[0] as Record<string, unknown> | undefined
    const messagePayload = first?.message as Record<string, unknown> | undefined
    const reply = String(messagePayload?.content ?? '').trim()
    if (!reply) {
      logGigachat({
        event: 'oxana_gigachat',
        ok: false,
        stage: 'chat',
        error_code: 'ai_empty_reply',
      })
      throw new OxanaAiUnavailableError()
    }
    logGigachat({ event: 'oxana_gigachat', ok: true, stage: 'chat' })
    return reply.slice(0, MAX_REPLY_CHARS)
  }

  private async getAccessToken(authKey: string): Promise<string> {
    if (this.cached && this.cached.expiresAtMs - TOKEN_REFRESH_SKEW_MS > Date.now()) {
      return this.cached.accessToken
    }
    let response: GigachatTransportResponse
    const scopeBody = `scope=${encodeURIComponent(resolveGigachatScope(this.env))}`
    try {
      response = await this.transport({
        url: GIGACHAT_OAUTH_URL,
        method: 'POST',
        timeoutMs: OAUTH_TIMEOUT_MS,
        headers: {
          Authorization: `Basic ${authKey}`,
          RqUID: randomUUID(),
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': String(Buffer.byteLength(scopeBody)),
          'User-Agent': USER_AGENT,
        },
        body: scopeBody,
      })
    } catch (error) {
      logGigachat({
        event: 'oxana_gigachat',
        ok: false,
        stage: 'oauth',
        error_code: safeErrorCode(error) ?? 'ai_unavailable',
        error_name: safeErrorName(error),
      })
      throw new OxanaAiUnavailableError()
    }
    if (response.status !== 200) {
      mapHttpError(response.status, 'oauth')
    }
    const payload = parseJson(response.text)
    const accessToken = String(payload?.access_token ?? '').trim()
    if (!accessToken) {
      throw new OxanaAiAuthError()
    }
    this.cached = {
      accessToken,
      expiresAtMs: parseExpiresAt(payload?.expires_at),
    }
    logGigachat({ event: 'oxana_gigachat', ok: true, stage: 'oauth' })
    return accessToken
  }
}
