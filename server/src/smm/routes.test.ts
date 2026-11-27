import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSmmRouter } from './routes.js'
import type { TokenVerifier } from '../oxana/tokenVerifier.js'

const userId = '11111111-1111-4111-8111-111111111111'
const verifier: TokenVerifier = { provider: 'supabase', verifyAccessToken: async token => token === 'test-token' ? userId : null }
const neverPool = () => { throw new Error('DB must not be called') }

test('SMM rejects unauthenticated calls, disabled mode and publication attempts', async () => {
  const previous = process.env.OXANA_ALLOWED_USER_IDS
  process.env.OXANA_ALLOWED_USER_IDS = userId
  try {
    const disabled = createSmmRouter(verifier, neverPool, () => false)
    const enabled = createSmmRouter(verifier, neverPool, () => true)
    const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }
    assert.equal((await enabled.request('/communities')).status, 401)
    assert.equal((await disabled.request('/status', { headers })).status, 503)
    const status = await enabled.request('/status', { headers })
    assert.equal(status.status, 200)
    assert.equal((await status.json()).publicationEnabled, false)
    const id = '22222222-2222-4222-8222-222222222222'
    assert.equal((await enabled.request('/posts/'+id+'/publish', { method: 'POST', headers })).status, 403)
    assert.equal((await enabled.request('/posts/'+id+'/approve', { method: 'POST', headers, body: JSON.stringify({version:1}) })).status, 400)
    assert.equal((await enabled.request('/posts', { method: 'POST', headers, body: JSON.stringify({communityId:'bad',body:'test'}) })).status, 400)
    process.env.OXANA_ALLOWED_USER_IDS = '33333333-3333-4333-8333-333333333333'
    assert.equal((await enabled.request('/status', { headers })).status, 403)
  } finally {
    if (previous === undefined) delete process.env.OXANA_ALLOWED_USER_IDS
    else process.env.OXANA_ALLOWED_USER_IDS = previous
  }
})
