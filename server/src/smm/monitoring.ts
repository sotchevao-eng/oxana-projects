export const monitoringSources = [
 {id:'sber-ai',group:'creative',name:'Сбер — GigaChat',url:'https://developers.sber.ru/',topic:'ИИ и автоматизация'},
 {id:'yandex-ai',group:'creative',name:'Yandex Cloud',url:'https://yandex.cloud/ru/',topic:'ИИ и облачные технологии'},
 {id:'fns',group:'tax',name:'ФНС России',url:'https://www.nalog.gov.ru/',topic:'Налоги и разъяснения'},
 {id:'law-tax',group:'tax',name:'Официальное опубликование правовых актов',url:'https://publication.pravo.gov.ru/',topic:'Законодательство'},
 {id:'minfin',group:'tax',name:'Минфин России',url:'https://minfin.gov.ru/',topic:'Финансы и налоги'},
 {id:'kad',group:'tax',name:'Картотека арбитражных дел',url:'https://kad.arbitr.ru/',topic:'Судебная практика'},
 {id:'gis-housing',group:'home',name:'ГИС ЖКХ',url:'https://dom.gosuslugi.ru/',topic:'Жилищно-коммунальное хозяйство'},
 {id:'law-home',group:'home',name:'Официальное опубликование правовых актов',url:'https://publication.pravo.gov.ru/',topic:'Жилищное законодательство'},
 {id:'water-ryazan',group:'home',name:'Водоканал Рязани',url:'https://vodokanalryazan.ru/press-tsentr/remontnye-raboty',topic:'Отключения холодной воды'},
 {id:'energy-ryazan',group:'home',name:'Р-Энергия',url:'https://r-energiya.ru/private-clients/elektrosnabzhenie/avarijnye-sluzhby-setevyh-organizacij-kopiya.html',topic:'Электроснабжение и аварийные службы'},
 {id:'city-ryazan',group:'home',name:'Администрация Рязани',url:'https://www.admrzn.ryazan.gov.ru/announcements/',topic:'Объявления об отключениях'},
 {id:'heat-ryazan',group:'home',name:'МУП РМПТС',url:'https://rmpts.ru/press-tsentr/novosti',topic:'Отопление и горячая вода'},
 {id:'region',group:'home',name:'Правительство Рязанской области',url:'https://ryazan.gov.ru/',topic:'Региональные новости'},
 {id:'culture',group:'history',name:'Культура.РФ',url:'https://www.culture.ru/',topic:'История и культурные мероприятия'},
 {id:'archive',group:'history',name:'Росархив',url:'https://archives.gov.ru/',topic:'Архивные исторические материалы'},
 {id:'museum',group:'history',name:'Центральный музей Вооруженных Сил',url:'https://cmaf.ru/',topic:'Военная история и музейные события'}
] as const
export function monitoringCatalog(){
 return {ok:true,mode:'manual',automaticCollection:false,externalCalls:false,sources:monitoringSources}
}
export function validateCandidate(input:unknown){
 if(!input||typeof input!=='object')return null
 const x=input as Record<string,unknown>
 const source=monitoringSources.find(s=>s.id===x.sourceId)
 if(!source||typeof x.title!=='string'||!x.title.trim()||x.title.trim().length>500||typeof x.url!=='string'||x.url.length>2000||typeof x.date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(x.date))return null
 const date=new Date(x.date+'T00:00:00Z')
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==x.date)return null
 try{
  const u=new URL(x.url), base=new URL(source.url)
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname!==base.hostname||u.pathname==='/'||u.hash)return null
  return {sourceId:source.id,title:x.title.trim(),url:u.href,date:x.date,verification:'unverified',sourceName:source.name,...(source.group==='home'?{addressMatch:classifyTsgAddress(x.title)}:{})}
 }catch{return null}
}

/** Conservative triage only; not proof of an outage. */
export function classifyTsgAddress(text:string):'exact_house'|'street_review'|'no_match'{
 const normalized=text.toLowerCase().replace(/ё/g,'е').replace(/\u00a0/g,' ')
 const street=/(?:васильевский\s+(?:проезд|пр-д|пр\.)|(?:проезд|пр-д|пр\.)\s+васильевский)(?![а-я])/gu
 for(const m of normalized.matchAll(street)){
  const rest=normalized.slice((m.index??0)+m[0].length)
  if(/^\s*[,:]?\s*(?:дома?\s*|д\.\s*)?(?:№\s*)?3(?![\dа-я/\-–—])(?!(?:\s+(?:корп(?:ус)?\.?|к\.|стр(?:оение)?\.?)))/u.test(rest))return 'exact_house'
 }
 return normalized.match(street)?'street_review':'no_match'
}
