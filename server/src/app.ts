import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requireAdmin } from './middleware/auth.js'
import { createPii, getPii, patchPii } from './routes/adminPii.js'
import { savePublicBriefPii } from './routes/publicBriefPii.js'
import { oxanaAiProvider, type OxanaAiProvider } from './oxana/aiAdapter.js'
import { createOxanaRouter } from './oxana/routes.js'
import { pgOxanaRepo } from './oxana/pgRepo.js'
import type { TokenVerifier } from './oxana/tokenVerifier.js'
import type { OxanaRepository } from './oxana/types.js'

export interface CreateAppOptions {
  oxanaRepo?: OxanaRepository
  oxanaTokenVerifier?: TokenVerifier
  oxanaAiProvider?: OxanaAiProvider
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono()

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  app.use(
    '*',
    cors({
      origin: origins,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
    }),
  )

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      service: 'oxana-pii-api',
      oxana: true,
      region_hint: 'Timeweb Moscow (configure privately)',
    }),
  )

  app.post('/api/pii', requireAdmin, (c) => createPii(c))
  app.get('/api/pii/:ref', requireAdmin, (c) => getPii(c))
  app.patch('/api/pii/:ref', requireAdmin, (c) => patchPii(c))
  app.post('/api/public/brief-pii', (c) => savePublicBriefPii(c))

  app.route(
    '/api/oxana',
    createOxanaRouter(
      options.oxanaRepo ?? pgOxanaRepo,
      options.oxanaTokenVerifier,
      options.oxanaAiProvider ?? oxanaAiProvider,
    ),
  )

  app.onError((error, c) => {
    console.info(
      JSON.stringify({
        event: 'unhandled_error',
        code: error instanceof Error ? error.name : 'unknown',
      }),
    )
    return c.json({ ok: false, error: 'server_error' }, 500)
  })

  return app
}
