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
 const r=await request(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html','User-Agent':'OXANA-SMM municipal monitor/1.0'}})
 if(!r.ok||!r.headers.get('content-type')?.toLowerCase().includes('text/html')||!r.body)throw Error('source_unavailable')
 const reader=r.body.getReader();let size=0;const decoder=new TextDecoder();let text=''
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1000000)throw Error('response_limit');text+=decoder.decode(part.value,{stream:true})}return text+decoder.decode()}finally{await reader.cancel().catch(()=>{})}
}
export async function probeMunicipalSources(request:typeof fetch=fetch){
 return Promise.all(sources.map(async s=>{
  try{const html=await boundedHtml(s.url,request);const links=discoverLinks(html,s.url,s.path);return {id:s.id,status:links.length?'links_found':'parser_review',links}}
  catch{return {id:s.id,status:'unavailable',links:[]}}
 }))
}
