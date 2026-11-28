// No external calls, credential reads, purchases or provider SDKs in this registry.
export const providerIds = ['gigachat','yandex','cloudru'] as const
export type ProviderId = typeof providerIds[number]
export interface GenerationRequest {
  prompt: string
  model: string
  maxOutputTokens: number
  requestId: string
}
export interface GenerationResult {
  text: string
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}
export interface GenerationAdapter {
  readonly provider: ProviderId
  generate(request: GenerationRequest): Promise<GenerationResult>
}
const names: Record<ProviderId,string> = {gigachat:'GigaChat',yandex:'Yandex AI Studio',cloudru:'Cloud.ru'}
export function providerCatalog() {
  return {
    ok:true, selectedProvider:null, externalCallsEnabled:false,
    budgetKopecks:0, mode:'simulation',
    providers:providerIds.map(id=>({
      id,name:names[id],state:'not_connected',
      commercialTermsVerified:false,adapterReady:false,models:[],
      generationEnabled:false
    }))
  }
}
// Commercial calls remain blocked until separately implemented and approved.
export async function commercialGenerate(_request:unknown):Promise<never>{
  throw new Error('commercial_generation_disabled')
}
