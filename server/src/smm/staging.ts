import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { createSmmRouter } from './routes.js'
import { getOxanaPool } from '../oxana/db.js'
import type { Pool } from 'pg'
import { stagingHtml, stagingCss, stagingJs } from './stagingUi.js'

export const STAGING_USER = '11111111-1111-4111-8111-111111111111'

export function createSmmStagingApp(
  env: NodeJS.ProcessEnv = process.env,
  pool: () => Pool = getOxanaPool,
) {
  // This app deliberately never mounts production PII, OXANA or reminder routes.
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  app.get('/api/health', c => c.json({ok:true,service:'oxana-smm-staging',smokeOnly:true}))
  if (env.OXANA_STAGING_SMOKE_ONLY !== 'true' || env.OXANA_SMM_STAGING_AUTH !== 'true') return app
  const hash = env.OXANA_SMM_TEST_TOKEN_SHA256 ?? ''
  const raw = env.OXANA_DATABASE_URL ?? ''
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('staging_db_config_invalid') }
  const invalid: string[] = []
  if (!/^[a-f0-9]{64}$/.test(hash)) invalid.push('TOKEN_SHA256_FORMAT')
  if (env.OXANA_REMINDERS !== 'disable') invalid.push('REMINDERS')
  if (env.OXANA_ALLOWED_USER_IDS !== STAGING_USER) invalid.push('ALLOWED_USER_IDS')
  if (url.protocol !== 'postgresql:') invalid.push('DB_PROTOCOL')
  if (url.pathname !== '/oxana_smm_test') invalid.push('DB_NAME')
  if (url.username !== 'smm_test_runtime') invalid.push('DB_USER')
  if (!env.OXANA_DB_CONNECT_HOST) invalid.push('DB_CONNECT_HOST')
  if (!env.OXANA_DB_CA_CERT?.includes('BEGIN CERTIFICATE')) invalid.push('DB_CA_CERT')
  if (env.OXANA_DB_SSL?.trim().toLowerCase() === 'disable') invalid.push('DB_SSL_DISABLED')
  if (invalid.length) throw new Error('staging_config_invalid: ' + invalid.join(','))
  const verifier = {
    provider: 'isolated-staging',
    async verifyAccessToken(token: string) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null
      const digest = createHash('sha256').update(token, 'utf8').digest()
      return timingSafeEqual(digest, Buffer.from(hash,'hex')) ? STAGING_USER : null
    }
  }
  if (env.OXANA_SMM_ENABLED === 'true') {
    app.use('/smm-test/*', async (c,next) => {
      c.header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
      c.header('X-Content-Type-Options','nosniff')
      c.header('Referrer-Policy','no-referrer')
      await next()
    })
    app.get('/smm-test/', c => c.html(stagingHtml))
    app.get('/smm-test/style.css', c => c.text(stagingCss,200,{'Content-Type':'text/css; charset=utf-8'}))
    app.get('/smm-test/app.js', c => c.text(stagingJs,200,{'Content-Type':'application/javascript; charset=utf-8'}))
  }
  app.route('/api/smm', createSmmRouter(verifier, pool, () => env.OXANA_SMM_ENABLED === 'true'))
  app.onError((_error,c) => c.json({ok:false,error:'staging_request_failed'},500))
  return app
}
