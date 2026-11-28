import { classifyTsgAddress } from './monitoring.js'
const sources=[
 {id:'water-ryazan',url:'https://vodokanalryazan.ru/press-tsentr/remontnye-raboty',path:'/press-tsentr/remontnye-raboty/'},
 {id:'city-ryazan',url:'https://www.admrzn.ryazan.gov.ru/announcements/',path:'/announcements/'}
] as const
export function discoverLinks(html:string,base:string,path:string){
 const origin=new URL(base).origin, links=new Set<string>()
 for(const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)){
  try{const u=new URL(m[1].replace(/&amp;/g,'&'),base)
   if(u.origin!==origin||u.username||u.password||u.search||u.hash||!u.pathname.startsWith(path)||u.pathname===path)continue
   if(path==='/announcements/'&&!/^\/announcements\/\d+\/?$/.test(u.pathname))continue
   if(path!='/announcements/'&&!/otklyuchenie/i.test(u.pathname))continue
   links.add(u.href)
  }catch{}
  if(links.size>=10)break
 }
 return [...links]
}
async function boundedHtml(url:string,request:typeof fetch){
 const r=await request(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html','User-Agent':'OXANA-SMM municipal monitor/1.0'}})
 if(!r.ok)throw Error('http_'+r.status)
 if(!r.headers.get('content-type')?.toLowerCase().includes('text/html')||!r.body)throw Error('not_html')
 const reader=r.body.getReader();let size=0;const decoder=new TextDecoder();let text=''
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1000000)throw Error('response_limit');text+=decoder.decode(part.value,{stream:true})}return text+decoder.decode()}finally{await reader.cancel().catch(()=>{})}
}

function plain(html:string){
 return html.replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()
}
export function titleDate(title:string):string|null{
 const m=title.match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/)
 if(!m)return null
 const iso=m[3]+'-'+m[2]+'-'+m[1],d=new Date(iso+'T00:00:00Z')
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null
}
export function parseMunicipalArticle(html:string){
 const clean=html.replace(/<!--[\s\S]*?-->|<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
 const main=clean.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]??clean.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
 const title=plain(clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'').slice(0,500)
 if(!main||!title)return {title:title||'Заголовок не извлечён',addressMatch:'unknown',status:'parser_review'}
 const body=plain(main)
 if(!body)return {title,addressMatch:'unknown',status:'parser_review'}
 return {title,titleDate:titleDate(title),addressMatch:classifyTsgAddress(body),status:'review_required'}
}
function diagnostic(e:unknown){
 const s=e instanceof Error?e.message:''
 return /^(http_\d{3}|not_html|response_limit)$/.test(s)?s:e instanceof Error&&(e.name==='TimeoutError'||e.name==='AbortError')?'timeout':'network_error'
}
export async function probeMunicipalSources(request:typeof fetch=fetch){
 return Promise.all(sources.map(async s=>{
  try{
   const html=await boundedHtml(s.url,request)
   const links=discoverLinks(html,s.url,s.path)
   const articles=[]
   for(let i=0;i<links.length;i+=3){
   const batch=await Promise.all(links.slice(i,i+3).map(async url=>{
    try{return {url,...parseMunicipalArticle(await boundedHtml(url,request))}}
    catch(e){return {url,title:'Не удалось прочитать объявление',addressMatch:'unknown',status:diagnostic(e)}}
   }))
   articles.push(...batch)
   }
   return {id:s.id,status:links.length?'links_found':'parser_review',links,articles,diagnostic:null}
  }catch(e){return {id:s.id,status:'unavailable',links:[],articles:[],diagnostic:diagnostic(e)}}
 }))
}
