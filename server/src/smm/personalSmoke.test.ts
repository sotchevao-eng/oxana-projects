import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personalSmoke } from './personalSmoke.js'
import { GIGACHAT_CHAT_URL, GIGACHAT_OAUTH_URL, type GigachatTransport } from '../oxana/gigachatClient.js'
const env={OXANA_STAGING_SMOKE_ONLY:'true',OXANA_SMM_STAGING_AUTH:'true',OXANA_SMM_PERSONAL_SMOKE:'true',GIGACHAT_SCOPE:'GIGACHAT_API_PERS',GIGACHAT_AUTH_KEY:'synthetic-test-key'}
test('personal smoke stays disabled without explicit gate or personal scope',async()=>{
 let calls=0
 const transport:GigachatTransport=async()=>{calls++;throw Error('unexpected')}
 for(const e of [{...env,OXANA_SMM_PERSONAL_SMOKE:'false'},{...env,GIGACHAT_SCOPE:'GIGACHAT_API_B2B'},{...env,OXANA_STAGING_SMOKE_ONLY:'false'}])await assert.rejects(personalSmoke('Lite',e,transport))
 assert.equal(calls,0)
})
test('personal smoke uses exactly one bounded completion and reports provider usage',async()=>{
 let oauth=0,chat=0
 const transport:GigachatTransport=async req=>{
  if(req.url===GIGACHAT_OAUTH_URL){oauth++;return {status:200,text:JSON.stringify({access_token:'fake',expires_at:Date.now()+600000})}}
  assert.equal(req.url,GIGACHAT_CHAT_URL);chat++
  const p=JSON.parse(req.body??'{}')
  assert.equal(p.model,'GigaChat-2')
  assert.equal(p.max_tokens,128)
  assert.equal(p.function_call,'none')
  assert.match(p.messages[1].content,/фиолетовом облаке/)
  return {status:200,text:JSON.stringify({choices:[{finish_reason:'stop',message:{content:'Условный ответ'}}],usage:{total_tokens:64}})}
 }
 const result=await personalSmoke('Lite',env,transport)
 assert.equal(result.totalTokens,64);assert.equal(oauth,1);assert.equal(chat,1)
})
test('missing usage is not reported as zero and failures are not retried',async()=>{
 let calls=0
 const transport:GigachatTransport=async req=>{
  if(req.url===GIGACHAT_OAUTH_URL)return {status:200,text:JSON.stringify({access_token:'fake'})}
  calls++;return {status:200,text:JSON.stringify({choices:[{message:{content:'test'}}]})}
 }
 await assert.rejects(personalSmoke('Lite',env,transport),/usage_unavailable/)
 assert.equal(calls,1)
})
