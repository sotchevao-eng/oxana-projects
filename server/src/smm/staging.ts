import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { createSmmRouter } from './routes.js'
import { getOxanaPool } from '../oxana/db.js'
import type { Pool } from 'pg'

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
  if (!/^[a-f0-9]{64}$/.test(hash) ||
      env.OXANA_REMINDERS !== 'disable' ||
      env.OXANA_ALLOWED_USER_IDS !== STAGING_USER ||
      url.protocol !== 'postgresql:' ||
      url.pathname !== '/oxana_smm_test' ||
      url.username !== 'smm_test_runtime' ||
      !env.OXANA_DB_CONNECT_HOST ||
      !env.OXANA_DB_CA_CERT?.includes('BEGIN CERTIFICATE') ||
      env.OXANA_DB_SSL?.trim().toLowerCase() === 'disable') {
    throw new Error('staging_config_invalid')
  }
  const verifier = {
    provider: 'isolated-staging',
    async verifyAccessToken(token: string) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null
      const digest = createHash('sha256').update(token, 'utf8').digest()
      return timingSafeEqual(digest, Buffer.from(hash,'hex')) ? STAGING_USER : null
    }
  }
  app.route('/api/smm', createSmmRouter(verifier, pool, () => env.OXANA_SMM_ENABLED === 'true'))
  app.onError((_error,c) => c.json({ok:false,error:'staging_request_failed'},500))
  return app
}
