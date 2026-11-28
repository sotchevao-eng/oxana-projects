import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { saveMunicipalScan } from './municipalJournal.js'
import { createTsgCallback } from './tsgCallback.js'
import { createSmmRouter } from './routes.js'

const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'

test('SMM PostgreSQL: migration, owner isolation, versions, approval and concurrency', async () => {
  // Only a disposable database with a fixed loopback address; never use production env.
  assert.equal(process.env.SMM_TEST_DB,'disposable-local-ci')
  const pool=new Pool({host:'127.0.0.1',port:55439,database:'smm_ci',user:'smm_ci',password:'smm_ci_test_only',connectionTimeoutMillis:5000})
  const runtime=new Pool({host:'127.0.0.1',port:55439,database:'smm_ci',user:'smm_runtime',password:'smm_runtime_test_only',connectionTimeoutMillis:5000})
  const previous=process.env.OXANA_ALLOWED_USER_IDS
  process.env.OXANA_ALLOWED_USER_IDS=A+','+B
  try {
    const db=await pool.query('SELECT current_database() AS name, current_user AS role')
    assert.equal(db.rows[0].name,'smm_ci')
    assert.equal(db.rows[0].role,'smm_ci')
    const existing=await pool.query("SELECT to_regnamespace('smm') AS schema")
    assert.equal(existing.rows[0].schema,null,'Test database must be empty')
    await pool.query(await readFile(new URL('../../../russian-postgres/smm-001.sql',import.meta.url),'utf8'))
    await pool.query(await readFile(new URL('../../../russian-postgres/smm-002.sql',import.meta.url),'utf8'))
    await pool.query(await readFile(new URL('../../../russian-postgres/smm-003.sql',import.meta.url),'utf8'))
    await pool.query(await readFile(new URL('../../../russian-postgres/smm-004.sql',import.meta.url),'utf8'))
    await pool.query(await readFile(new URL('../../../russian-postgres/smm-005.sql',import.meta.url),'utf8'))
    await pool.query(await readFile(new URL('../../../russian-postgres/smm-006.sql',import.meta.url),'utf8'))
    await pool.query("CREATE ROLE smm_runtime LOGIN PASSWORD 'smm_runtime_test_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT")
    await pool.query("GRANT USAGE ON SCHEMA smm TO smm_runtime; GRANT SELECT,INSERT ON smm.communities,smm.posts,smm.post_versions,smm.approvals TO smm_runtime; GRANT UPDATE ON smm.communities,smm.posts TO smm_runtime; GRANT SELECT,INSERT,UPDATE ON smm.plan_items,smm.studio_requests,smm.personal_smoke TO smm_runtime; GRANT SELECT,INSERT ON smm.tsg_callback_events TO smm_runtime; GRANT SELECT,INSERT ON smm.municipal_checks TO smm_runtime; GRANT SELECT,INSERT,UPDATE ON smm.municipal_notices TO smm_runtime; GRANT USAGE ON SEQUENCE smm.municipal_checks_id_seq TO smm_runtime; GRANT INSERT ON smm.audit_logs TO smm_runtime; GRANT USAGE ON SEQUENCE smm.audit_logs_id_seq TO smm_runtime")
    assert.equal((await runtime.query('SELECT current_user AS role')).rows[0].role,'smm_runtime')
    for (const sql of ['DELETE FROM smm.personal_smoke','DELETE FROM smm.studio_requests','DELETE FROM smm.plan_items','DELETE FROM smm.communities','UPDATE smm.post_versions SET body=body','DELETE FROM smm.approvals','SELECT * FROM smm.budget_limits','SELECT * FROM smm.audit_logs','CREATE TABLE smm.forbidden(id int)']) {
      await assert.rejects(runtime.query(sql), {code:'42501'})
    }
    await assert.rejects(runtime.query('DELETE FROM smm.tsg_callback_events'),{code:'42501'})
    await assert.rejects(runtime.query('UPDATE smm.tsg_callback_events SET post_id=1'),{code:'42501'})
    const callbackSecret='synthetic-callback-secret-ci-only'
    const callback=createTsgCallback({OXANA_STAGING_SMOKE_ONLY:'true',OXANA_SMM_STAGING_AUTH:'true',OXANA_SMM_ENABLED:'true',VK_TSG_CALLBACK_ENABLED:'true',VK_TSG_CALLBACK_SECRET:callbackSecret,VK_TSG_CALLBACK_CONFIRMATION:'synthetic-confirmation'},()=>runtime)
    const callbackBody={group_id:146520897,secret:callbackSecret,type:'wall_post_new',object:{id:123,owner_id:-146520897,from_id:-146520897,text:'synthetic private text'}}
    const sendCallback=()=>callback.request('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(callbackBody)})
    const replies=await Promise.all([sendCallback(),sendCallback()])
    assert.deepEqual(replies.map(r=>r.status),[200,200])
    assert.deepEqual(await Promise.all(replies.map(r=>r.text())),['ok','ok'])
    const events=await runtime.query('SELECT * FROM smm.tsg_callback_events')
    assert.equal(events.rowCount,1)
    assert.deepEqual(Object.keys(events.rows[0]).sort(),['post_id','received_at'])
    assert.equal(Number(events.rows[0].post_id),123)
    await assert.rejects(runtime.query('DELETE FROM smm.municipal_notices'),{code:'42501'})
    await assert.rejects(runtime.query('UPDATE smm.municipal_checks SET link_count=0'),{code:'42501'})
    const scan:Parameters<typeof saveMunicipalScan>[2]=[{id:'water-ryazan',status:'links_found',links:['https://vodokanalryazan.ru/press-tsentr/remontnye-raboty/otklyuchenie-test'],diagnostic:null,articles:[{url:'https://vodokanalryazan.ru/press-tsentr/remontnye-raboty/otklyuchenie-test',title:'Тест 27.11.2026',titleDate:'2026-11-27',addressMatch:'exact_house',status:'review_required'}]}]
    const scanDb=await runtime.connect()
    try {
      await saveMunicipalScan(scanDb,A,scan)
      await saveMunicipalScan(scanDb,A,scan)
      assert.equal((await scanDb.query('SELECT count(*)::int AS n FROM smm.municipal_notices WHERE owner_id=$1',[A])).rows[0].n,1)
      assert.equal((await scanDb.query('SELECT count(*)::int AS n FROM smm.municipal_checks WHERE owner_id=$1',[A])).rows[0].n,2)
      await saveMunicipalScan(scanDb,A,[{id:'water-ryazan',status:'links_found',links:[scan[0].articles[0].url],diagnostic:null,articles:[{url:scan[0].articles[0].url,title:'Ошибка чтения',status:'network_error',addressMatch:'unknown'}]}])
      assert.equal((await scanDb.query('SELECT title FROM smm.municipal_notices WHERE owner_id=$1',[A])).rows[0].title,'Тест 27.11.2026')
    } finally {scanDb.release()}
    const app=createSmmRouter({provider:'test',verifyAccessToken:async token=>token==='owner-a'?A:token==='owner-b'?B:null},()=>runtime,()=>true)
    async function call(path:string, method='GET', body?:unknown, owner='owner-a'){
      const response=await app.request(path,{method,headers:{Authorization:'Bearer '+owner,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
      return {status:response.status,data:await response.json() as any}
    }
    const c=await call('/communities','POST',{name:'Synthetic group',editorialPolicy:''})
    assert.equal(c.status,201)
    const cid=c.data.community.id as string
    assert.equal((await call('/communities','GET',undefined,'owner-b')).data.communities.length,0)
    assert.equal((await call('/communities/'+cid,'PATCH',{name:'Unauthorized',editorialPolicy:''},'owner-b')).status,404)
    assert.equal((await call('/communities/'+cid,'PATCH',{name:'Updated group',editorialPolicy:'Synthetic policy'})).status,200)
    assert.equal((await call('/posts','POST',{communityId:cid,body:'Foreign draft'},'owner-b')).status,404)
    assert.equal((await call('/studio/personal/run','POST',{confirm:true})).status,403)
    const personalEnv={OXANA_STAGING_SMOKE_ONLY:'true',OXANA_SMM_STAGING_AUTH:'true',OXANA_SMM_PERSONAL_SMOKE:'true',GIGACHAT_SCOPE:'GIGACHAT_API_PERS',GIGACHAT_AUTH_KEY:'synthetic-no-network'}
    const isolated=createSmmRouter({provider:'test',verifyAccessToken:async token=>token==='owner-a'?A:null},()=>runtime,()=>true,personalEnv)
    const personalHeaders={Authorization:'Bearer owner-a','Content-Type':'application/json'}
    const initial=await isolated.request('/studio/personal/status',{headers:personalHeaders})
    assert.equal((await initial.json()).enabled,true)
    assert.equal((await isolated.request('/studio/personal/run',{method:'POST',headers:personalHeaders,body:JSON.stringify({confirm:true,topic:'not allowed'})})).status,400)
    // Pre-reserve without calling network; verifies fail-closed after interrupted request.
    await runtime.query("INSERT INTO smm.personal_smoke(owner_id,state) VALUES($1,'reserved')",[A])
    const blocked=await isolated.request('/studio/personal/run',{method:'POST',headers:personalHeaders,body:JSON.stringify({confirm:true})})
    assert.equal(blocked.status,409)
    const after=await isolated.request('/studio/personal/status',{headers:personalHeaders})
    assert.equal((await after.json()).enabled,false)
    const studio={communityId:cid,topic:'Synthetic studio topic',tone:'expert',length:'medium'}
    const studioStatus=await call('/studio/status')
    assert.equal(studioStatus.data.monthlyLimitKopecks,0)
    assert.equal(studioStatus.data.externalRequestsEnabled,false)
    const preview=await call('/studio/preview','POST',studio)
    assert.equal(preview.status,200)
    assert.equal(preview.data.externalRequests,0)
    assert.equal(preview.data.chargedKopecks,0)
    assert.match(preview.data.brief,/Synthetic policy/)
    assert.match(preview.data.brief,/Synthetic studio topic/)
    assert.equal((await call('/studio/preview','POST',studio,'owner-b')).status,404)
    assert.equal((await call('/studio/preview','POST',{...studio,tone:'unknown'})).status,400)
    assert.equal((await call('/studio/generate','POST',studio)).status,403)
    const requestId='33333333-3333-4333-8333-333333333333'
    assert.equal((await call('/studio/simulate','POST',{requestId,confirm:false})).status,400)
    const simulations=await Promise.all([call('/studio/simulate','POST',{requestId,confirm:true}),call('/studio/simulate','POST',{requestId,confirm:true})])
    assert.deepEqual(simulations.map(x=>x.status).sort(),[200,409])
    assert.equal(simulations.find(x=>x.status===200)?.data.realTokens,0)
    for(let i=0;i<4;i++)assert.equal((await call('/studio/simulate','POST',{requestId:'44444444-4444-4444-8444-44444444444'+i,confirm:true})).status,200)
    assert.equal((await call('/studio/simulate','POST',{requestId:'55555555-5555-4555-8555-555555555555',confirm:true})).status,429)
    const quota=await call('/studio/quota')
    assert.equal(quota.data.day_requests,5)
    assert.equal(quota.data.month_reserved,20000)
    assert.equal(quota.data.realTokens,0)
    assert.equal((await call('/studio/quota','GET',undefined,'owner-b')).data.day_requests,0)
    const plan={communityId:cid,topic:'Synthetic topic',date:'2026-12-01',time:'09:30'}
    assert.equal((await call('/plan','POST',{...plan,date:'2026-02-30'})).status,400)
    assert.equal((await call('/plan','POST',{...plan,time:'25:00'})).status,400)
    assert.equal((await call('/plan','POST',plan,'owner-b')).status,404)
    const item=await call('/plan','POST',plan)
    assert.equal(item.status,201)
    const planPath='/plan/'+item.data.item.id
    assert.equal((await call('/plan','GET',undefined,'owner-b')).data.items.length,0)
    assert.equal((await call(planPath,'PATCH',{...plan,revision:1},'owner-b')).status,404)
    assert.equal((await call(planPath,'PATCH',{...plan,date:'2026-12-02',revision:1})).status,200)
    assert.equal((await call(planPath,'PATCH',{...plan,revision:1})).status,409)
    const saved=(await call('/plan')).data.items[0]
    assert.equal(saved.date,'2026-12-02')
    assert.equal(saved.time,'09:30')
    assert.equal(saved.revision,2)
    const p=await call('/posts','POST',{communityId:cid,body:'Version one'})
    assert.equal(p.status,201)
    const id=p.data.post.id as string
    const path='/posts/'+id
    assert.equal((await call('/posts','GET',undefined,'owner-b')).data.posts.length,0)
    assert.equal((await call(path+'/approve','POST',{version:1,confirm:true},'owner-b')).status,404)
    assert.equal((await call(path,'PATCH',{version:1,body:'Foreign edit'},'owner-b')).status,404)
    assert.equal((await call(path+'/approve','POST',{version:1,confirm:true})).status,200)
    assert.equal((await call(path+'/approve','POST',{version:1,confirm:true})).status,200)
    assert.equal((await call('/posts')).data.posts[0].approved,true)
    assert.equal((await call(path,'PATCH',{version:1,body:'Version two'})).status,200)
    assert.equal((await call('/posts')).data.posts[0].approved,false)
    assert.equal((await call(path+'/approve','POST',{version:1,confirm:true})).status,409)
    const edits=await Promise.all([call(path,'PATCH',{version:2,body:'Concurrent A'}),call(path,'PATCH',{version:2,body:'Concurrent B'})])
    assert.deepEqual(edits.map(x=>x.status).sort(),[200,409])
    assert.equal((await call(path+'/publish','POST')).status,403)
    const versions=await pool.query('SELECT version FROM smm.post_versions WHERE post_id=$1 ORDER BY version',[id])
    assert.deepEqual(versions.rows.map(x=>x.version),[1,2,3])
    const audits=await pool.query("SELECT count(*)::int AS n FROM smm.audit_logs WHERE subject_id=$1 AND action='post_approved'",[id])
    assert.equal(audits.rows[0].n,1)
    await assert.rejects(pool.query('INSERT INTO smm.posts(owner_id,community_id) VALUES($1,$2)',[B,cid]))
    const before=await pool.query('SELECT count(*)::int AS n FROM smm.posts')
    await assert.rejects(pool.query('INSERT INTO smm.posts(owner_id,community_id) VALUES($1,$2)',[A,cid]))
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM smm.posts')).rows[0].n,before.rows[0].n)
  } finally {
    if(previous===undefined)delete process.env.OXANA_ALLOWED_USER_IDS
    else process.env.OXANA_ALLOWED_USER_IDS=previous
    await runtime.end()
    await pool.end()
  }
})
