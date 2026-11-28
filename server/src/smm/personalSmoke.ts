// Isolated personal smoke test; never accepts user content or community data.
import { GigachatClient, defaultGigachatTransport, GIGACHAT_CHAT_URL, GIGACHAT_OAUTH_URL, type GigachatTransport } from '../oxana/gigachatClient.js'

export const SMOKE_MODELS = {Lite:'GigaChat-2',Pro:'GigaChat-2-Pro',Max:'GigaChat-2-Max'} as const
export type SmokeModel = keyof typeof SMOKE_MODELS
export async function personalSmoke(model: SmokeModel, env: NodeJS.ProcessEnv, transport?: GigachatTransport) {
  if(!Object.hasOwn(SMOKE_MODELS,model)) throw new Error('invalid_model')
  if(env.OXANA_STAGING_SMOKE_ONLY!=='true'||env.OXANA_SMM_STAGING_AUTH!=='true'||env.OXANA_SMM_PERSONAL_SMOKE!=='true'||env.GIGACHAT_SCOPE!=='GIGACHAT_API_PERS'||!env.GIGACHAT_AUTH_KEY?.trim()) throw new Error('smoke_disabled')
  const scoped={...env,GIGACHAT_MODEL:SMOKE_MODELS[model]}
  let usage:number|null=null, sent=false
  const client=new GigachatClient(scoped,async req=>{
    if(req.url!==GIGACHAT_CHAT_URL&&req.url!==GIGACHAT_OAUTH_URL)throw new Error('unexpected_endpoint')
    if(req.url===GIGACHAT_CHAT_URL){
      if(sent)throw new Error('repeat_blocked')
      sent=true
      const payload=JSON.parse(req.body??'{}')
      payload.max_tokens=128
      payload.function_call='none'
      const body=JSON.stringify(payload)
      req={...req,body,headers:{...req.headers,'Content-Length':String(Buffer.byteLength(body))}}
    }
    const r=await (transport?transport(req):defaultGigachatTransport(req,scoped))
    if(req.url===GIGACHAT_CHAT_URL&&r.status===200){
      const u=JSON.parse(r.text)?.usage?.total_tokens
      if(typeof u==='number'&&Number.isSafeInteger(u)&&u>=0)usage=u
    }
    return r
  })
  const result=await client.complete({messages:[{role:'system',content:'Ты помощник для личного учебного эксперимента. Не используй инструменты.'},{role:'user',content:'Придумай два коротких предложения о вымышленном фиолетовом облаке для личного дневника.'}],functionCall:'none'})
  if(result.functionCall||!result.content.trim())throw new Error('invalid_reply')
  if(usage===null)throw new Error('usage_unavailable')
  return {text:result.content,model:SMOKE_MODELS[model],totalTokens:usage}
}
