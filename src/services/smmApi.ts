export interface SmmCommunity { id:string; name:string; editorial_policy:string }
export interface SmmPost { id:string; community_id:string; current_version:number; body:string; approved:boolean }

export async function smmRequest<T>(token:string,path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T> {
  const configured=import.meta.env.VITE_OXANA_API_URL?.trim()
  if(!configured) throw new Error('Адрес API ОКСИ не настроен.')
  const base=new URL(configured,window.location.origin)
  if(base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname))) throw new Error('Требуется защищённое подключение к API.')
  const root=base.href.replace(/\/$/,'').replace(/\/api\/oxana$/,'').replace(/\/api$/,'')
  const response=await fetch(root+'/api/smm'+path,{
    method,signal,redirect:'error',cache:'no-store',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  })
  const data=await response.json().catch(()=>null)
  if(!response.ok || data?.ok!==true){
    const messages:Record<string,string>={smm_disabled:'Модуль пока отключён на сервере.',version_conflict:'Версия изменилась. Обновите список перед продолжением.',unauthorized:'Сессия истекла. Войдите снова.',oxana_forbidden:'Нет доступа к модулю.',not_found:'Запись не найдена.'}
    throw new Error(messages[data?.error]??'Операция не выполнена. Код HTTP: '+response.status)
  }
  return data as T
}
