import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { createTsgCallback } from './tsgCallback.js'
const secret='synthetic-secret-for-testing-only'
const env={OXANA_STAGING_SMOKE_ONLY:'true',OXANA_SMM_STAGING_AUTH:'true',OXANA_SMM_ENABLED:'true',VK_TSG_CALLBACK_ENABLED:'true',VK_TSG_CALLBACK_SECRET:secret,VK_TSG_CALLBACK_CONFIRMATION:'synthetic-confirmation'}
const group_id=146520897
const event={group_id,secret,type:'wall_post_new',object:{id:123,owner_id:-group_id,from_id:-group_id,text:'synthetic private text',attachments:[{private:'synthetic'}]}}
const request=(app:ReturnType<typeof createTsgCallback>,body:unknown)=>app.request('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
test('callback disabled by default; rejects foreign group, wrong secret and missing secret',async()=>{
 const never=()=>{throw Error('unexpected database call')}
 assert.equal((await request(createTsgCallback({...env,VK_TSG_CALLBACK_ENABLED:'false'},never),event)).status,503)
 const app=createTsgCallback(env,never)
 for(const body of [{...event,secret:'wrong'},{...event,group_id:1},{...event,secret:undefined},null])assert.equal((await request(app,body)).status,403)
 const r=await request(app,{group_id,secret,type:'confirmation'})
 assert.equal(r.status,200);assert.equal(await r.text(),'synthetic-confirmation')
 assert.equal((await request(app,{...event,object:{...event.object,text:'x'.repeat(300000)}})).status,413)
})
test('only community post ID is passed to database; unrelated events ignored',async()=>{
 const calls:unknown[][]=[]
 const pool=()=>({query:async(...args:unknown[])=>{calls.push(args)}} as unknown as Pool)
 const app=createTsgCallback(env,pool)
 for(const body of [{...event,type:'message_new'},{...event,object:{...event.object,from_id:42}},{...event,object:{...event.object,owner_id:-42}},{...event,object:{...event.object,id:0}}])assert.equal(await (await request(app,body)).text(),'ok')
 assert.equal(calls.length,0)
 const r=await request(app,event)
 assert.equal(r.status,200);assert.equal(await r.text(),'ok')
 assert.deepEqual(calls,[['INSERT INTO smm.tsg_callback_events(post_id) VALUES($1) ON CONFLICT DO NOTHING',[123]]])
 const broken=createTsgCallback(env,()=>({query:async()=>{throw Error('synthetic db failure')}} as unknown as Pool))
 const failure=await request(broken,event)
 assert.equal(failure.status,503);assert.equal(await failure.text(),'retry')
})

test('mounted public callback returns exact plain text over both expected URL forms',async()=>{
 const { Hono }=await import('hono')
 const app=new Hono({strict:false})
 app.route('/api/vk/tsg-callback',createTsgCallback(env,()=>{throw Error('unexpected database call')}))
 for(const path of ['/api/vk/tsg-callback','/api/vk/tsg-callback/']){
  const r=await app.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({group_id,secret,type:'confirmation',v:'5.199',event_id:'synthetic'})})
  assert.equal(r.status,200)
  assert.match(r.headers.get('content-type')??'',/^text\/plain(?:;|$)/i)
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),Buffer.from(env.VK_TSG_CALLBACK_CONFIRMATION,'utf8'))
 }
})
