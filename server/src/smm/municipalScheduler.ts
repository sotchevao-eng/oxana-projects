import type { Pool } from 'pg'
import { probeMunicipalSources } from './municipalReader.js'
import { saveMunicipalScan } from './municipalJournal.js'

const INTERVAL=15*60*1000
const OWNER='11111111-1111-4111-8111-111111111111'
export function createMunicipalScheduler(env:NodeJS.ProcessEnv,pool:()=>Pool,probe=probeMunicipalSources){
 const allowed=env.OXANA_STAGING_SMOKE_ONLY==='true'&&env.OXANA_SMM_STAGING_AUTH==='true'&&env.OXANA_SMM_ENABLED==='true'&&env.OXANA_ALLOWED_USER_IDS===OWNER
 const configured=allowed&&env.OXANA_SMM_MUNICIPAL_AUTO==='true'
 let timer:ReturnType<typeof setInterval>|null=null
 let active:Promise<unknown>|null=null
 let lastStart=0,lastAutomatic:string|null=null,nextAutomatic:string|null=null
 let outcome='not_run'
 function status(){return {configured,running:timer!==null,busy:active!==null,intervalMinutes:15,lastAutomatic,nextAutomatic,outcome}}
 async function execute(owner:string,automatic:boolean){
  if(!allowed||owner!==OWNER||(automatic&&(!configured||!timer)))return {kind:'disabled' as const}
  if(active||Date.now()-lastStart<60000)return {kind:'busy' as const}
  lastStart=Date.now()
  const work=(async()=>{
   const db=await pool().connect()
   let locked=false
   try{
    locked=(await db.query('SELECT pg_try_advisory_lock(734029,1) AS locked')).rows[0].locked===true
    if(!locked)return {kind:'busy' as const}
    if(automatic){
     const recent=await db.query('SELECT EXISTS(SELECT 1 FROM smm.municipal_checks WHERE owner_id=$1 AND checked_at>now()-interval \'14 minutes\') AS recent',[owner])
     if(recent.rows[0].recent)return {kind:'recent' as const}
    }
    const sources=await probe()
    await db.query('BEGIN')
    try{await saveMunicipalScan(db,owner,sources);await db.query('COMMIT')}
    catch(e){await db.query('ROLLBACK');throw e}
    return {kind:'saved' as const,sources,checkedAt:new Date().toISOString()}
   }finally{
    try{if(locked)await db.query('SELECT pg_advisory_unlock(734029,1)');db.release()}
    catch{db.release(true)}
   }
  })()
  active=work
  try{return await work}finally{active=null}
 }
 async function tick(){
  if(!timer)return
  nextAutomatic=new Date(Date.now()+INTERVAL).toISOString()
  try{const r=await execute(OWNER,true);outcome=r.kind;if(r.kind==='saved')lastAutomatic=r.checkedAt}
  catch{outcome='failed';console.info('[municipal] scan_failed')}
 }
 return {
  status,
  manual:(owner:string)=>execute(owner,false),
  start(){if(!configured||timer)return;nextAutomatic=new Date(Date.now()+INTERVAL).toISOString();timer=setInterval(()=>void tick(),INTERVAL);timer.unref?.()},
  async stop(){if(timer)clearInterval(timer);timer=null;nextAutomatic=null;if(active)await active.catch(()=>{})}
 }
}
export type MunicipalScheduler=ReturnType<typeof createMunicipalScheduler>
