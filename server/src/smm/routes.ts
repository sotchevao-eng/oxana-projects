import { Hono } from 'hono'
import { createRequireOxanaOwner } from '../oxana/auth.js'
import { createConfiguredTokenVerifier, type TokenVerifier } from '../oxana/tokenVerifier.js'
import { getOxanaPool } from '../oxana/db.js'
import type { Pool, PoolClient } from 'pg'

type Env = { Variables: { userId: string } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function field(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return s.length > 0 && s.length <= max ? s : null
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
  // No publisher, scheduler, media or AI credentials in this version.
  app.post('/posts/:id/publish',c=>c.json({ok:false,error:'publication_disabled'},403))
  return app
}
