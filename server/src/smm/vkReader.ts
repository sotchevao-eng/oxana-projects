// Explicit read-only adapter; no arbitrary methods, URLs, group IDs or token exposure.
const endpoint='https://api.vk.ru/method/wall.get'
export const vkCommunities = {oxanaai:'OXANA PROJECTS',nalogovaya_ne_strashna:'Налоговая не страшна',tsgvasilevskiy:'ТСЖ «Васильевский»'} as const
export type VkDomain=keyof typeof vkCommunities
export function isVkDomain(value:unknown):value is VkDomain{return typeof value==='string'&&Object.hasOwn(vkCommunities,value)}
const domain='oxanaai'
type Fetcher=typeof fetch
export function vkReaderStatus(env:NodeJS.ProcessEnv){
 return {ok:true,community:'OXANA PROJECTS',domain,communities:Object.entries(vkCommunities).map(([domain,name])=>({domain,name})),configured:Boolean(env.VK_SERVICE_TOKEN?.trim()),readEnabled:env.OXANA_STAGING_SMOKE_ONLY==='true'&&env.OXANA_SMM_STAGING_AUTH==='true'&&Boolean(env.VK_SERVICE_TOKEN?.trim()),publicationEnabled:false}
}
export async function readOxanaWall(env:NodeJS.ProcessEnv,fetcher:Fetcher=fetch,selected:VkDomain='oxanaai'){
 if(!isVkDomain(selected))throw new Error('vk_domain_invalid')
 if(!vkReaderStatus(env).readEnabled)throw new Error('vk_read_disabled')
 const body=new URLSearchParams({access_token:env.VK_SERVICE_TOKEN!.trim(),v:'5.199',domain:selected,count:'20',filter:'owner'})
 const response=await fetcher(endpoint,{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}})
 if(!response.ok)throw new Error('vk_http_error')
 const data=await response.json()
 if(data?.error||!Array.isArray(data?.response?.items))throw new Error('vk_api_error')
 const posts=data.response.items.slice(0,20).flatMap((p: any)=>{
  if(!Number.isSafeInteger(p?.id)||p.id<=0||!Number.isSafeInteger(p.owner_id)||p.owner_id>=0||p.from_id!==p.owner_id||!Number.isSafeInteger(p.date)||p.date<=0)return []
  return [{id:p.id,ownerId:p.owner_id,date:p.date,text:typeof p.text==='string'?p.text.slice(0,20000):'',url:'https://vk.ru/wall'+p.owner_id+'_'+p.id}]
 })
 if(new Set(posts.map((p:any)=>p.ownerId)).size>1)throw new Error('vk_owner_mismatch')
 return {ok:true,community:vkCommunities[selected],domain:selected,posts,publicationEnabled:false}
}
