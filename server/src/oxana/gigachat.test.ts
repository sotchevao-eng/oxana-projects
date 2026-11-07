import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { SignJWT } from 'jose'
import { createApp } from '../app.js'
import { GigaChatAdapter } from './aiAdapter.js'
import {
  GIGACHAT_CHAT_URL,
  GIGACHAT_OAUTH_URL,
  GigachatClient,
  OXANA_CHAT_SYSTEM_PROMPT,
  gigachatTlsOptions,
  resolveGigachatModel,
  resolveGigachatScope,
  type GigachatTransportRequest,
} from './gigachatClient.js'
import { MemoryOxanaRepo } from './memoryRepo.js'

const TEST_SECRET = 'oxana-test-jwt-secret-please-change'
const OWNER_A = '11111111-1111-4111-8111-111111111111'

async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_SECRET))
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

let previousAllowlist: string | undefined
let previousJwtSecret: string | undefined
let previousAuthKey: string | undefined

function restoreEnv(): void {
  if (previousAllowlist === undefined) {
    delete process.env.OXANA_ALLOWED_USER_IDS
  } else {
    process.env.OXANA_ALLOWED_USER_IDS = previousAllowlist
  }
  if (previousJwtSecret === undefined) {
    delete process.env.SUPABASE_JWT_SECRET
  } else {
    process.env.SUPABASE_JWT_SECRET = previousJwtSecret
  }
  if (previousAuthKey === undefined) {
    delete process.env.GIGACHAT_AUTH_KEY
  } else {
    process.env.GIGACHAT_AUTH_KEY = previousAuthKey
  }
}

function isolateEnv(): void {
  previousAllowlist = process.env.OXANA_ALLOWED_USER_IDS
  previousJwtSecret = process.env.SUPABASE_JWT_SECRET
  previousAuthKey = process.env.GIGACHAT_AUTH_KEY
  process.env.SUPABASE_JWT_SECRET = TEST_SECRET
  process.env.OXANA_ALLOWED_USER_IDS = OWNER_A
  process.env.GIGACHAT_AUTH_KEY = 'dGVzdC1hdXRoLWtleQ=='
}

afterEach(() => {
  restoreEnv()
})

function mockTransport(handler: (request: GigachatTransportRequest) => {
  status: number
  text: string
}) {
  const calls: GigachatTransportRequest[] = []
  return {
    calls,
    transport: async (request: GigachatTransportRequest) => {
      calls.push(request)
      return handler(request)
    },
  }
}

async function postChat(
  app: ReturnType<typeof createApp>,
  message = 'Привет, Окси',
) {
  const token = await signToken(OWNER_A)
  return app.request('/api/oxana/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })
}

test('chat stays unconfigured and does not invent a reply', async () => {
  isolateEnv()
  delete process.env.GIGACHAT_AUTH_KEY
  const app = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const response = await postChat(app)
  const body = await readJson(response)
  assert.equal(response.status, 503)
  assert.equal(body.error, 'ai_not_configured')
  assert.equal(body.reply, undefined)
})

test('successful GigaChat reply is returned without tools or owner data', async () => {
  isolateEnv()
  const { calls, transport } = mockTransport((request) => {
    if (request.url === GIGACHAT_OAUTH_URL) {
      return {
        status: 200,
        text: JSON.stringify({
          access_token: 'access-token',
          expires_at: Date.now() + 30 * 60_000,
        }),
      }
    }
    return {
      status: 200,
      text: JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Здравствуйте, я ОКСИ.' } }],
      }),
    }
  })
  const app = createApp({
    oxanaRepo: new MemoryOxanaRepo(),
    oxanaAiProvider: new GigaChatAdapter({ transport }),
  })
  const response = await postChat(app, 'Как дела?')
  const body = await readJson(response)
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.reply, 'Здравствуйте, я ОКСИ.')
  assert.equal(body.provider, 'gigachat')

  const oauth = calls.find((item) => item.url === GIGACHAT_OAUTH_URL)
  const chat = calls.find((item) => item.url === GIGACHAT_CHAT_URL)
  assert.ok(oauth)
  assert.ok(chat)
  assert.equal(oauth?.headers.Authorization?.startsWith('Basic '), true)
  assert.equal(chat?.headers.Authorization, 'Bearer access-token')
  assert.equal(chat?.headers['User-Agent'], 'OXANA-PII-API/0.1')
  const payload = JSON.parse(chat?.body ?? '{}') as {
    messages: Array<{ role: string; content: string }>
    model: string
  }
  assert.equal(payload.model, 'GigaChat-2')
  assert.equal(payload.messages[0]?.role, 'system')
  assert.equal(payload.messages[0]?.content, OXANA_CHAT_SYSTEM_PROMPT)
  assert.equal(payload.messages[1]?.role, 'user')
  assert.equal(payload.messages[1]?.content, 'Как дела?')
  assert.equal(JSON.stringify(payload).includes(OWNER_A), false)
  assert.equal(JSON.stringify(payload).includes('task'), false)
  assert.equal(JSON.stringify(payload).includes('project'), false)
})

test('GigaChat 401 becomes ai_auth_failed without a reply', async () => {
  isolateEnv()
  const { transport } = mockTransport(() => ({
    status: 401,
    text: JSON.stringify({ status: 401, message: 'Unauthorized' }),
  }))
  const app = createApp({
    oxanaRepo: new MemoryOxanaRepo(),
    oxanaAiProvider: new GigaChatAdapter({ transport }),
  })
  const response = await postChat(app)
  const body = await readJson(response)
  assert.equal(response.status, 502)
  assert.equal(body.error, 'ai_auth_failed')
  assert.equal(body.reply, undefined)
})

test('GigaChat 429 becomes ai_rate_limited without a reply', async () => {
  isolateEnv()
  const { transport } = mockTransport((request) => {
    if (request.url === GIGACHAT_OAUTH_URL) {
      return {
        status: 200,
        text: JSON.stringify({
          access_token: 'access-token',
          expires_at: Date.now() + 30 * 60_000,
        }),
      }
    }
    return {
      status: 429,
      text: JSON.stringify({ status: 429, message: 'Too Many Requests' }),
    }
  })
  const app = createApp({
    oxanaRepo: new MemoryOxanaRepo(),
    oxanaAiProvider: new GigaChatAdapter({ transport }),
  })
  const response = await postChat(app)
  const body = await readJson(response)
  assert.equal(response.status, 429)
  assert.equal(body.error, 'ai_rate_limited')
  assert.equal(body.reply, undefined)
})

test('GigaChat timeout becomes ai_unavailable without a reply', async () => {
  isolateEnv()
  const { transport } = mockTransport(() => {
    throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
  })
  const app = createApp({
    oxanaRepo: new MemoryOxanaRepo(),
    oxanaAiProvider: new GigaChatAdapter({ transport }),
  })
  const response = await postChat(app)
  const body = await readJson(response)
  assert.equal(response.status, 503)
  assert.equal(body.error, 'ai_unavailable')
  assert.equal(body.reply, undefined)
})

test('empty GigaChat content is not replaced with a fake answer', async () => {
  isolateEnv()
  const { transport } = mockTransport((request) => {
    if (request.url === GIGACHAT_OAUTH_URL) {
      return {
        status: 200,
        text: JSON.stringify({
          access_token: 'access-token',
          expires_at: Date.now() + 30 * 60_000,
        }),
      }
    }
    return {
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: '   ' } }] }),
    }
  })
  const app = createApp({
    oxanaRepo: new MemoryOxanaRepo(),
    oxanaAiProvider: new GigaChatAdapter({ transport }),
  })
  const response = await postChat(app)
  const body = await readJson(response)
  assert.equal(response.status, 503)
  assert.equal(body.error, 'ai_unavailable')
  assert.equal(body.reply, undefined)
})

test('owner status marks GigaChat ready only when credentials exist', async () => {
  isolateEnv()
  const token = await signToken(OWNER_A)
  const configured = createApp({
    oxanaRepo: new MemoryOxanaRepo(),
    oxanaAiProvider: new GigaChatAdapter({
      transport: async () => ({ status: 500, text: '' }),
    }),
  })
  const readyBody = await readJson(
    await configured.request('/api/oxana/status', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  const readyAi = readyBody.ai as Record<string, unknown>
  assert.equal(readyAi.provider, 'gigachat')
  assert.equal(readyAi.configured, true)
  assert.equal(readyAi.ready, true)

  delete process.env.GIGACHAT_AUTH_KEY
  const missing = createApp({ oxanaRepo: new MemoryOxanaRepo() })
  const missingBody = await readJson(
    await missing.request('/api/oxana/status', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  const missingAi = missingBody.ai as Record<string, unknown>
  assert.equal(missingAi.configured, false)
  assert.equal(missingAi.ready, false)
})

test('GIGACHAT_SCOPE is sent only as official GIGACHAT_API_* values', () => {
  assert.equal(resolveGigachatScope({}), 'GIGACHAT_API_PERS')
  assert.equal(
    resolveGigachatScope({ GIGACHAT_SCOPE: 'GIGACHAT_API_PERS' }),
    'GIGACHAT_API_PERS',
  )
  assert.equal(
    resolveGigachatScope({ GIGACHAT_SCOPE: 'GIGACHAT_API_B2B' }),
    'GIGACHAT_API_B2B',
  )
  assert.equal(
    resolveGigachatScope({ GIGACHAT_SCOPE: 'gigachat_api_corp' }),
    'GIGACHAT_API_CORP',
  )
  assert.equal(resolveGigachatScope({ GIGACHAT_SCOPE: 'PERS' }), 'GIGACHAT_API_PERS')
  assert.equal(resolveGigachatScope({ GIGACHAT_SCOPE: 'b2b' }), 'GIGACHAT_API_B2B')
  assert.equal(resolveGigachatScope({ GIGACHAT_SCOPE: 'unknown' }), 'GIGACHAT_API_PERS')
})

test('GIGACHAT_MODEL is sent only as an official GigaChat identifier', () => {
  assert.equal(resolveGigachatModel({}), 'GigaChat-2')
  assert.equal(
    resolveGigachatModel({ GIGACHAT_MODEL: 'GigaChat-2' }),
    'GigaChat-2',
  )
  assert.equal(
    resolveGigachatModel({ GIGACHAT_MODEL: 'GigaChat-2-Max' }),
    'GigaChat-2-Max',
  )
  assert.equal(
    resolveGigachatModel({ GIGACHAT_MODEL: 'unknown-model' }),
    'GigaChat-2',
  )
})

test('oauth uses Basic key, unique RqUID and official scope body', async () => {
  const { calls, transport } = mockTransport((request) => {
    if (request.url === GIGACHAT_OAUTH_URL) {
      return {
        status: 200,
        text: JSON.stringify({
          access_token: `token-${calls.filter((item) => item.url === GIGACHAT_OAUTH_URL).length}`,
          expires_at: 1,
        }),
      }
    }
    return {
      status: 200,
      text: JSON.stringify({
        choices: [{ message: { content: 'ответ модели' } }],
      }),
    }
  })
  const client = new GigachatClient(
    {
      GIGACHAT_AUTH_KEY: 'Basic dGVzdC1hdXRoLWtleQ==',
      GIGACHAT_SCOPE: 'GIGACHAT_API_B2B',
    },
    transport,
  )
  await client.chat('первый')
  await client.chat('второй')
  const oauthCalls = calls.filter((item) => item.url === GIGACHAT_OAUTH_URL)
  assert.equal(oauthCalls.length, 2)
  assert.equal(oauthCalls[0]?.headers.Authorization, 'Basic dGVzdC1hdXRoLWtleQ==')
  assert.equal(oauthCalls[0]?.body, 'scope=GIGACHAT_API_B2B')
  const rquids = oauthCalls.map((item) => String(item.headers.RqUID))
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  assert.equal(uuidRe.test(rquids[0] ?? ''), true)
  assert.equal(uuidRe.test(rquids[1] ?? ''), true)
  assert.notEqual(rquids[0], rquids[1])
})

test('fresh access token is reused until it expires', async () => {
  const { calls, transport } = mockTransport((request) => {
    if (request.url === GIGACHAT_OAUTH_URL) {
      return {
        status: 200,
        text: JSON.stringify({
          access_token: 'cached-token',
          expires_at: Date.now() + 30 * 60_000,
        }),
      }
    }
    return {
      status: 200,
      text: JSON.stringify({
        choices: [{ message: { content: 'ответ модели' } }],
      }),
    }
  })
  const client = new GigachatClient(
    { GIGACHAT_AUTH_KEY: 'dGVzdC1hdXRoLWtleQ==' },
    transport,
  )
  await client.chat('один')
  await client.chat('два')
  assert.equal(calls.filter((item) => item.url === GIGACHAT_OAUTH_URL).length, 1)
  assert.equal(
    calls.filter((item) => item.url === GIGACHAT_CHAT_URL).length,
    2,
  )
})

test('TLS options keep certificate verification enabled', () => {
  const options = gigachatTlsOptions({})
  assert.equal(options.rejectUnauthorized, true)
  assert.equal(options.ca, undefined)
})

test('gigachat logs omit secrets and user text', async () => {
  const lines: string[] = []
  const original = console.info
  console.info = (message?: unknown) => {
    lines.push(String(message))
  }
  try {
    const { transport } = mockTransport((request) => {
      if (request.url === GIGACHAT_OAUTH_URL) {
        return {
          status: 200,
          text: JSON.stringify({
            access_token: 'super-secret-access-token',
            expires_at: Date.now() + 30 * 60_000,
          }),
        }
      }
      return {
        status: 200,
        text: JSON.stringify({
          choices: [{ message: { content: 'секретный ответ модели' } }],
        }),
      }
    })
    const client = new GigachatClient(
      { GIGACHAT_AUTH_KEY: 'dGVzdC1hdXRoLWtleQ==' },
      transport,
    )
    await client.chat('секретный вопрос владельца')
    const logged = lines.join('\n')
    assert.equal(logged.includes('dGVzdC1hdXRoLWtleQ=='), false)
    assert.equal(logged.includes('super-secret-access-token'), false)
    assert.equal(logged.includes('секретный вопрос владельца'), false)
    assert.equal(logged.includes('секретный ответ модели'), false)
  } finally {
    console.info = original
  }
})

test('chat still requires the owner allowlist', async () => {
  isolateEnv()
  const app = createApp({
    oxanaRepo: new MemoryOxanaRepo(),
    oxanaAiProvider: new GigaChatAdapter({
      transport: async () => ({
        status: 200,
        text: JSON.stringify({
          choices: [{ message: { content: 'не должно появиться' } }],
        }),
      }),
    }),
  })
  const response = await app.request('/api/oxana/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Привет' }),
  })
  const body = await readJson(response)
  assert.equal(response.status, 401)
  assert.equal(body.reply, undefined)
})
