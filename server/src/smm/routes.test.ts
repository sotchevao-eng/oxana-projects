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

import { createHash } from 'node:crypto'
import { createSmmStagingApp, STAGING_USER } from './staging.js'

test('isolated staging requires explicit opt-in and valid hashed test token; production routes absent', async () => {
  const previous=process.env.OXANA_ALLOWED_USER_IDS
  process.env.OXANA_ALLOWED_USER_IDS=STAGING_USER
  try {
    const token='a'.repeat(64)
    const env={
      OXANA_STAGING_SMOKE_ONLY:'true', OXANA_SMM_STAGING_AUTH:'true',
      OXANA_SMM_ENABLED:'true', OXANA_REMINDERS:'disable',
      OXANA_ALLOWED_USER_IDS:STAGING_USER,
      OXANA_SMM_TEST_TOKEN_SHA256:createHash('sha256').update(token).digest('hex'),
      OXANA_DATABASE_URL:'postgresql://smm_test_runtime:fake@example.invalid/oxana_smm_test',
      OXANA_DB_CONNECT_HOST:'192.168.0.1', OXANA_DB_CA_CERT:'BEGIN CERTIFICATE',
    }
    assert.equal((await createSmmStagingApp({},neverPool).request('/api/smm/status')).status,404)
    assert.throws(()=>createSmmStagingApp({...env,OXANA_DATABASE_URL:'postgresql://smm_test_runtime:fake@example.invalid/default_db'},neverPool))
    assert.throws(()=>createSmmStagingApp({...env,OXANA_SMM_TEST_TOKEN_SHA256:''},neverPool))
    const app=createSmmStagingApp(env,neverPool)
    const ui=await app.request('/smm-test/')
    assert.equal(ui.status,200)
    assert.match(await ui.text(),/OXANA SMM/)
    assert.match(ui.headers.get('content-security-policy')??'',/connect-src 'self'/)
    const js=await app.request('/smm-test/app.js')
    assert.equal(js.status,200)
    assert.match(js.headers.get('content-type')??'',/application\/javascript/)
    const script=await js.text()
    assert.doesNotThrow(()=>new Function(script))
    assert.equal((await createSmmStagingApp({},neverPool).request('/smm-test/')).status,404)
    assert.equal((await createSmmStagingApp({...env,OXANA_SMM_ENABLED:'false'},neverPool).request('/smm-test/')).status,404)
    const headers={Authorization:'Bearer '+token}
    assert.equal((await app.request('/api/smm/status')).status,401)
    assert.equal((await app.request('/api/smm/status',{headers:{Authorization:'Bearer '+'b'.repeat(64)}})).status,401)
    assert.equal((await app.request('/api/smm/status',{headers})).status,200)
    assert.equal((await app.request('/api/smm/posts/22222222-2222-4222-8222-222222222222/publish',{method:'POST',headers})).status,403)
    assert.equal((await app.request('/api/oxana/tasks',{headers})).status,404)
    assert.equal((await app.request('/api/public/brief-pii',{method:'POST',headers})).status,404)
    assert.equal((await createSmmStagingApp({...env,OXANA_SMM_ENABLED:'false'},neverPool).request('/api/smm/status',{headers})).status,503)
  } finally {
    if(previous===undefined)delete process.env.OXANA_ALLOWED_USER_IDS
    else process.env.OXANA_ALLOWED_USER_IDS=previous
  }
})

import { classifyTsgAddress, validateCandidate } from './monitoring.js'
test('municipal source address triage never treats neighboring house numbers as exact',()=>{
 for(const s of ['Васильевский проезд, д. 3','проезд Васильевский, дом 3','Васильевский пр-д, 3, 5'])assert.equal(classifyTsgAddress(s),'exact_house')
 for(const s of ['Васильевский проезд, 13','Васильевский проезд, 30','Васильевский проезд, 31','Васильевский проезд, 3а','Васильевский проезд, 3/1','Васильевский проезд, 3 корп. 1','Васильевский проезд'])assert.equal(classifyTsgAddress(s),'street_review')
 assert.equal(classifyTsgAddress('улица Ленина, 3'),'no_match')
 const candidate=validateCandidate({sourceId:'water-ryazan',title:'Васильевский проезд, д. 3',url:'https://vodokanalryazan.ru/press-tsentr/remontnye-raboty/synthetic',date:'2026-11-28'})
 assert.equal(candidate?.verification,'unverified')
 assert.equal(candidate?.addressMatch,'exact_house')
})
