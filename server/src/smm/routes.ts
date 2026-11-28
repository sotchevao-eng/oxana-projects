import { Hono } from 'hono'
import { createRequireOxanaOwner } from '../oxana/auth.js'
import { createConfiguredTokenVerifier, type TokenVerifier } from '../oxana/tokenVerifier.js'
import { getOxanaPool } from '../oxana/db.js'
import type { Pool, PoolClient } from 'pg'
import { isGigachatConfigured } from '../oxana/gigachatClient.js'

type Env = { Variables: { userId: string } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function field(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return s.length > 0 && s.length <= max ? s : null
}
function planInput(input: any) {
  const topic=field(input?.topic,500), date=input?.date, time=input?.time, community=input?.communityId
  if(!topic||typeof community!=='string'||!uuid.test(community)||typeof date!=='string'||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(date)||typeof time!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) return null
  const parsed=new Date(date+'T00:00:00Z')
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date) return null
  return {topic,date,time,community}
}
async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export function createSmmRouter(
  verifier: TokenVerifier = createConfiguredTokenVerifier(),
  pool: () => Pool = getOxanaPool,
  enabled: () => boolean = () => process.env.OXANA_SMM_ENABLED === 'true',
) {
  const app = new Hono<Env>()
  app.use('*', createRequireOxanaOwner(verifier))
  app.use('*', async (c, next) => {
    if (!enabled()) return c.json({ ok: false, error: 'smm_disabled' }, 503)
    await next()
  })
  app.get('/status', c => c.json({ ok: true, publicationEnabled: false, paidGenerationEnabled: false }))
  app.get('/communities', async c => {
    const result = await pool().query('SELECT id,name,editorial_policy,created_at FROM smm.communities WHERE owner_id=$1 ORDER BY created_at,id', [c.get('userId')])
    return c.json({ ok: true, communities: result.rows })
  })
  app.post('/communities', async c => {
    const input = await c.req.json().catch(() => null)
    const name = field(input?.name, 200)
    const policy = typeof input?.editorialPolicy === 'string' && input.editorialPolicy.length <= 10000 ? input.editorialPolicy.trim() : input?.editorialPolicy === undefined ? '' : null
    if (!name || policy === null) return c.json({ ok:false,error:'invalid_community' },400)
    const owner = c.get('userId')
    const row = await transaction(pool(), async db => {
      const result = await db.query('INSERT INTO smm.communities(owner_id,name,editorial_policy) VALUES($1,$2,$3) RETURNING id,name,editorial_policy', [owner,name,policy])
      await db.query("INSERT INTO smm.audit_logs(owner_id,action,subject_id) VALUES($1,'community_created',$2)",[owner,result.rows[0].id])
      return result.rows[0]
    })
    return c.json({ok:true,community:row},201)
  })
  app.patch('/communities/:id', async c => {
    const id = c.req.param('id'), owner = c.get('userId')
    const input = await c.req.json().catch(() => null)
    const name = field(input?.name, 200)
    const policy = typeof input?.editorialPolicy === 'string' && input.editorialPolicy.length <= 10000 ? input.editorialPolicy.trim() : null
    if (!uuid.test(id) || !name || policy === null) return c.json({ok:false,error:'invalid_community'},400)
    const row = await transaction(pool(), async db => {
      const result = await db.query('UPDATE smm.communities SET name=$3,editorial_policy=$4 WHERE owner_id=$1 AND id=$2 RETURNING id,name,editorial_policy',[owner,id,name,policy])
      if (!result.rowCount) return null
      await db.query("INSERT INTO smm.audit_logs(owner_id,action,subject_id) VALUES($1,'community_updated',$2)",[owner,id])
      return result.rows[0]
    })
    if (!row) return c.json({ok:false,error:'not_found'},404)
    return c.json({ok:true,community:row})
  })
  app.get('/posts', async c => {
    const result = await pool().query(`SELECT p.id,p.community_id,p.current_version,v.body,
      EXISTS(SELECT 1 FROM smm.approvals a WHERE a.owner_id=p.owner_id AND a.post_id=p.id AND a.version=p.current_version) AS approved
      FROM smm.posts p JOIN smm.post_versions v ON (v.owner_id,v.post_id,v.version)=(p.owner_id,p.id,p.current_version)
      WHERE p.owner_id=$1 ORDER BY p.created_at DESC,p.id`,[c.get('userId')])
    return c.json({ok:true,posts:result.rows})
  })
  app.post('/posts', async c => {
    const input = await c.req.json().catch(() => null)
    const body = field(input?.body,20000)
    const community = input?.communityId
    if (!body || typeof community !== 'string' || !uuid.test(community)) return c.json({ok:false,error:'invalid_post'},400)
    const owner=c.get('userId')
    const row=await transaction(pool(),async db=>{
      const result=await db.query('INSERT INTO smm.posts(owner_id,community_id) SELECT owner_id,id FROM smm.communities WHERE owner_id=$1 AND id=$2 RETURNING id,current_version',[owner,community])
      if (!result.rowCount) return null
      const post=result.rows[0]
      await db.query('INSERT INTO smm.post_versions(owner_id,post_id,version,body) VALUES($1,$2,1,$3)',[owner,post.id,body])
      await db.query("INSERT INTO smm.audit_logs(owner_id,action,subject_id) VALUES($1,'post_created',$2)",[owner,post.id])
      return post
    })
    if (!row) return c.json({ok:false,error:'not_found'},404)
    return c.json({ok:true,post:row},201)
  })
  app.patch('/posts/:id',async c=>{
    const id=c.req.param('id'), owner=c.get('userId')
    const input=await c.req.json().catch(()=>null)
    const body=field(input?.body,20000), expected=input?.version
    if (!uuid.test(id)||!body||!Number.isSafeInteger(expected)||expected<1) return c.json({ok:false,error:'invalid_version'},400)
    const result=await transaction(pool(),async db=>{
      const p=await db.query('SELECT current_version FROM smm.posts WHERE owner_id=$1 AND id=$2 FOR UPDATE',[owner,id])
      if (!p.rowCount) return 'missing'
      if(p.rows[0].current_version!==expected) return 'conflict'
      await db.query('INSERT INTO smm.post_versions(owner_id,post_id,version,body) VALUES($1,$2,$3,$4)',[owner,id,expected+1,body])
      await db.query('UPDATE smm.posts SET current_version=$3 WHERE owner_id=$1 AND id=$2',[owner,id,expected+1])
      await db.query("INSERT INTO smm.audit_logs(owner_id,action,subject_id) VALUES($1,'post_edited',$2)",[owner,id])
      return 'ok'
    })
    if(result==='missing') return c.json({ok:false,error:'not_found'},404)
    if(result==='conflict') return c.json({ok:false,error:'version_conflict'},409)
    return c.json({ok:true,version:expected+1,approved:false})
  })
  app.post('/posts/:id/approve',async c=>{
    const id=c.req.param('id'),owner=c.get('userId')
    const input=await c.req.json().catch(()=>null)
    const version=input?.version
    if(!uuid.test(id)||!Number.isSafeInteger(version)||version<1||input?.confirm!==true) return c.json({ok:false,error:'explicit_confirmation_required'},400)
    const result=await transaction(pool(),async db=>{
      const p=await db.query('SELECT current_version FROM smm.posts WHERE owner_id=$1 AND id=$2 FOR UPDATE',[owner,id])
      if(!p.rowCount) return 'missing'
      if(p.rows[0].current_version!==version) return 'conflict'
      const a=await db.query('INSERT INTO smm.approvals(owner_id,post_id,version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[owner,id,version])
      if(a.rowCount) await db.query("INSERT INTO smm.audit_logs(owner_id,action,subject_id) VALUES($1,'post_approved',$2)",[owner,id])
      return 'ok'
    })
    if(result==='missing') return c.json({ok:false,error:'not_found'},404)
    if(result==='conflict') return c.json({ok:false,error:'version_conflict'},409)
    return c.json({ok:true,approved:true,publicationEnabled:false})
  })
  app.get('/plan',async c=>{
    const rows=await pool().query("SELECT id,community_id,topic,to_char(planned_date,'YYYY-MM-DD') AS date,to_char(planned_time,'HH24:MI') AS time,revision FROM smm.plan_items WHERE owner_id=$1 ORDER BY planned_date,planned_time,id",[c.get('userId')])
    return c.json({ok:true,items:rows.rows})
  })
  app.post('/plan',async c=>{
    const p=planInput(await c.req.json().catch(()=>null)),owner=c.get('userId')
    if(!p)return c.json({ok:false,error:'invalid_plan'},400)
    const row=await transaction(pool(),async db=>{
      const r=await db.query('INSERT INTO smm.plan_items(owner_id,community_id,topic,planned_date,planned_time) SELECT owner_id,id,$3,$4,$5 FROM smm.communities WHERE owner_id=$1 AND id=$2 RETURNING id,revision',[owner,p.community,p.topic,p.date,p.time])
      if(!r.rowCount)return null
      await db.query("INSERT INTO smm.audit_logs(owner_id,action,subject_id) VALUES($1,'plan_created',$2)",[owner,r.rows[0].id])
      return r.rows[0]
    })
    if(!row)return c.json({ok:false,error:'not_found'},404)
    return c.json({ok:true,item:row},201)
  })
  app.patch('/plan/:id',async c=>{
    const id=c.req.param('id'),owner=c.get('userId'),input=await c.req.json().catch(()=>null),p=planInput(input),revision=input?.revision
    if(!uuid.test(id)||!p||!Number.isSafeInteger(revision)||revision<1)return c.json({ok:false,error:'invalid_plan'},400)
    const result=await transaction(pool(),async db=>{
      const old=await db.query('SELECT revision FROM smm.plan_items WHERE owner_id=$1 AND id=$2 FOR UPDATE',[owner,id])
      if(!old.rowCount)return 'missing'
      if(old.rows[0].revision!==revision)return 'conflict'
      const r=await db.query('UPDATE smm.plan_items SET community_id=$3,topic=$4,planned_date=$5,planned_time=$6,revision=revision+1 WHERE owner_id=$1 AND id=$2 AND EXISTS(SELECT 1 FROM smm.communities WHERE owner_id=$1 AND id=$3)',[owner,id,p.community,p.topic,p.date,p.time])
      if(!r.rowCount)return 'missing'
      await db.query("INSERT INTO smm.audit_logs(owner_id,action,subject_id) VALUES($1,'plan_updated',$2)",[owner,id])
      return 'ok'
    })
    if(result==='missing')return c.json({ok:false,error:'not_found'},404)
    if(result==='conflict')return c.json({ok:false,error:'version_conflict'},409)
    return c.json({ok:true,revision:revision+1})
  })
  app.get('/studio/status',c=>c.json({ok:true,mode:'preview',providerConfigured:isGigachatConfigured(),paidGenerationEnabled:false,monthlyLimitKopecks:0,externalRequestsEnabled:false}))
  app.post('/studio/preview',async c=>{
    const input=await c.req.json().catch(()=>null),owner=c.get('userId')
    const topic=field(input?.topic,500),community=input?.communityId
    const tone=input?.tone,length=input?.length
    if(!topic||typeof community!=='string'||!uuid.test(community)||!['informative','expert','sales'].includes(tone)||!['short','medium','long'].includes(length))return c.json({ok:false,error:'invalid_studio_input'},400)
    const result=await pool().query('SELECT name,editorial_policy FROM smm.communities WHERE owner_id=$1 AND id=$2',[owner,community])
    if(!result.rowCount)return c.json({ok:false,error:'not_found'},404)
    const group=result.rows[0]
    const tones:Record<string,string>={informative:'информационный',expert:'экспертный',sales:'продающий'}
    const lengths:Record<string,string>={short:'до 500 знаков',medium:'до 1200 знаков',long:'до 2500 знаков'}
    const brief=['ЗАДАНИЕ ДЛЯ ИИ (предпросмотр, без обращения к модели)','Сообщество: '+group.name,'Тема: '+topic,'Тон: '+tones[tone],'Объем: '+lengths[length],'Редакционные правила: '+group.editorial_policy,'Подготовь заголовок, текст, уместные хештеги и идею иллюстрации. Не выдумывай факты, источники или ссылки. Отметь утверждения, требующие проверки. Не используй персональные данные и закрытые сведения. Результат — только черновик для ручного согласования.'].join('\n')
    return c.json({ok:true,mode:'preview',brief,externalRequests:0,chargedKopecks:0})
  })
  // Deliberately simulated: no provider client, no external request, no arbitrary prompt.
  app.get('/studio/quota',async c=>{
    const q=await pool().query(`SELECT count(*) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')::int AS day_requests,
      count(*) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')::int AS month_requests,
      coalesce(sum(reserved_tokens) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'),0)::int AS month_reserved
      FROM smm.studio_requests WHERE owner_id=$1`,[c.get('userId')])
    return c.json({ok:true,mode:'simulation',dayLimit:5,monthLimit:30,monthTokenLimit:120000,realTokens:0,chargedKopecks:0,...q.rows[0]})
  })
  app.post('/studio/simulate',async c=>{
    const owner=c.get('userId'),input=await c.req.json().catch(()=>null),id=input?.requestId
    if(typeof id!=='string'||!uuid.test(id)||input?.confirm!==true)return c.json({ok:false,error:'explicit_confirmation_required'},400)
    const result=await transaction(pool(),async db=>{
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8317))',[owner])
      const existing=await db.query('SELECT state FROM smm.studio_requests WHERE owner_id=$1 AND request_id=$2',[owner,id])
      if(existing.rowCount)return 'duplicate'
      const counts=await db.query(`SELECT count(*) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')::int AS d,
        count(*) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')::int AS m,
        coalesce(sum(reserved_tokens) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'),0)::int AS t,
        count(*) FILTER (WHERE state='reserved')::int AS active FROM smm.studio_requests WHERE owner_id=$1`,[owner])
      const n=counts.rows[0]
      if(n.active>0)return 'busy'
      if(n.d>=5||n.m>=30||n.t+4000>120000)return 'limit'
      await db.query("INSERT INTO smm.studio_requests(owner_id,request_id,mode,reserved_tokens,state) VALUES($1,$2,'simulation',4000,'reserved')",[owner,id])
      await db.query("UPDATE smm.studio_requests SET state='completed',actual_tokens=0 WHERE owner_id=$1 AND request_id=$2",[owner,id])
      return 'ok'
    })
    if(result==='duplicate'||result==='busy')return c.json({ok:false,error:result},409)
    if(result==='limit')return c.json({ok:false,error:'simulation_limit'},429)
    return c.json({ok:true,mode:'simulation',text:'ТЕСТОВЫЙ МАКЕТ. Это не ответ нейросети. Проверка прохождения запроса и лимитов завершена.',realTokens:0,externalRequests:0,chargedKopecks:0})
  })
  app.post('/studio/generate',c=>c.json({ok:false,error:'paid_generation_disabled'},403))
  // No publisher, scheduler, media or external AI calls in this version.
  app.post('/posts/:id/publish',c=>c.json({ok:false,error:'publication_disabled'},403))
  return app
}
