// Explicit read-only adapter; no arbitrary methods, URLs, group IDs or token exposure.
const endpoint='https://api.vk.ru/method/wall.get'
export const vkCommunities = {oxanaai:'OXANA PROJECTS',nalogovaya_ne_strashna:'Налоговая не страшна',tsgvasilevskiy:'ТСЖ «Васильевский»'} as const
export type VkDomain=keyof typeof vkCommunities
export function isVkDomain(value:unknown):value is VkDomain{return typeof value==='string'&&Object.hasOwn(vkCommunities,value)}
const domain='oxanaai'
type Fetcher=typeof fetch
export class VkReadError extends Error {
 constructor(readonly stage:string,readonly code:number|null=null){super('vk_read_failed')}
}
export function vkDiagnostic(e:unknown){
 return e instanceof VkReadError?{stage:e.stage,code:e.code}:{stage:'internal',code:null}
}
export function vkReaderStatus(env:NodeJS.ProcessEnv){
 return {ok:true,community:'OXANA PROJECTS',domain,communities:Object.entries(vkCommunities).map(([domain,name])=>({domain,name})),configured:Boolean(env.VK_SERVICE_TOKEN?.trim()),readEnabled:env.OXANA_STAGING_SMOKE_ONLY==='true'&&env.OXANA_SMM_STAGING_AUTH==='true'&&Boolean(env.VK_SERVICE_TOKEN?.trim()),publicationEnabled:false}
}
export async function readOxanaWall(env:NodeJS.ProcessEnv,fetcher:Fetcher=fetch,selected:VkDomain='oxanaai'){
 if(!isVkDomain(selected))throw new Error('vk_domain_invalid')
 if(!vkReaderStatus(env).readEnabled)throw new Error('vk_read_disabled')
 const body=new URLSearchParams({access_token:env.VK_SERVICE_TOKEN!.trim(),v:'5.199',domain:selected,count:'20',filter:'owner'})
 let response:Response
 try{response=await fetcher(endpoint,{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}})}catch(e){throw new VkReadError(e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)?'timeout':'network')}
 if(!response.ok)throw new VkReadError('http',response.status)
 let data:any
 try{data=await response.json()}catch{throw new VkReadError('json')}
 if(data?.error)throw new VkReadError('api',Number.isSafeInteger(data.error.error_code)&&data.error.error_code>=0&&data.error.error_code<=99999?data.error.error_code:null)
 if(!Array.isArray(data?.response?.items))throw new VkReadError('response_shape')
 const posts=data.response.items.slice(0,20).flatMap((p: any)=>{
  if(!Number.isSafeInteger(p?.id)||p.id<=0||!Number.isSafeInteger(p.owner_id)||p.owner_id>=0||p.from_id!==p.owner_id||!Number.isSafeInteger(p.date)||p.date<=0)return []
  return [{id:p.id,ownerId:p.owner_id,date:p.date,text:typeof p.text==='string'?p.text.slice(0,20000):'',url:'https://vk.ru/wall'+p.owner_id+'_'+p.id}]
 })
 if(new Set(posts.map((p:any)=>p.ownerId)).size>1)throw new VkReadError('owner_mismatch')
 return {ok:true,community:vkCommunities[selected],domain:selected,posts,publicationEnabled:false}
}
