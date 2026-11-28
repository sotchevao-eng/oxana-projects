import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { Pool } from 'pg'

const GROUP=146520897
function equal(a:string,b:string){
 return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest())
}
export function createTsgCallback(env:NodeJS.ProcessEnv,pool:()=>Pool){
 const app=new Hono()
 app.use('*',bodyLimit({maxSize:256*1024,onError:c=>c.text('too large',413)}))
 app.post('/',async c=>{
  const secret=env.VK_TSG_CALLBACK_SECRET, confirmation=env.VK_TSG_CALLBACK_CONFIRMATION
  const diagnostic=(code:string)=>console.info('[tsg-callback] '+code)
  if(env.OXANA_STAGING_SMOKE_ONLY!=='true'||env.OXANA_SMM_STAGING_AUTH!=='true'||env.OXANA_SMM_ENABLED!=='true'||env.VK_TSG_CALLBACK_ENABLED!=='true'||!secret||secret.length<24||!confirmation||!/^[a-zA-Z0-9_-]{1,128}$/.test(confirmation)){diagnostic(env.VK_TSG_CALLBACK_ENABLED!=='true'?'flag_disabled':!secret||secret.length<24?'secret_config_invalid':!confirmation||!/^[a-zA-Z0-9_-]{1,128}$/.test(confirmation)?'confirmation_config_invalid':'staging_config_invalid');return c.text('disabled',503)}
  const d=await c.req.json().catch(()=>null)
  if(!d||d.group_id!==GROUP||typeof d.secret!=='string'||!equal(d.secret,secret)){diagnostic(!d?'invalid_json':d.group_id!==GROUP?'group_rejected':typeof d.secret!=='string'?'secret_missing':'secret_mismatch');return c.text('forbidden',403)}
  if(d.type==='confirmation'){diagnostic('confirmation_accepted');return c.text(confirmation)}
  if(d.type!=='wall_post_new')return c.text('ok')
  const p=d.object
  if(!p||p.owner_id!==-GROUP||p.from_id!==-GROUP||!Number.isSafeInteger(p.id)||p.id<=0)return c.text('ok')
  // No private text, attachments, member IDs, raw events or secrets persisted.
  try{
   await pool().query('INSERT INTO smm.tsg_callback_events(post_id) VALUES($1) ON CONFLICT DO NOTHING',[p.id])
   return c.text('ok')
  }catch{return c.text('retry',503)}
 })
 return app
}
