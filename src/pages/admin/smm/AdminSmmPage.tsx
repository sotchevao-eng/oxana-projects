import { useEffect, useState, type FormEvent } from 'react'
import { Megaphone, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { smmRequest, type SmmCommunity, type SmmPost } from '../../../services/smmApi'

const panel='rounded-2xl border border-border bg-surface p-5 space-y-3'
const input='w-full rounded-xl border border-border bg-bg p-3 text-ink'
const button='rounded-xl border border-border bg-soft px-4 py-2 text-sm font-medium text-ink disabled:opacity-50'

export function AdminSmmPage() {
  const {session,user}=useAuth()
  return <SmmWorkspace key={user?.id??'none'} token={session?.access_token??''}/>
}

function SmmWorkspace({token}:{token:string}) {
  const [communities,setCommunities]=useState<SmmCommunity[]>([])
  const [posts,setPosts]=useState<SmmPost[]>([])
  const [ready,setReady]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [reload,setReload]=useState(0)
  const [name,setName]=useState('')
  const [policy,setPolicy]=useState('')
  const [communityEdit,setCommunityEdit]=useState<string|null>(null)
  const [communityId,setCommunityId]=useState('')
  const [body,setBody]=useState('')
  const [postEdit,setPostEdit]=useState<SmmPost|null>(null)
  const [approval,setApproval]=useState<SmmPost|null>(null)

  useEffect(()=>{
    const ctrl=new AbortController()
    setReady(false)
    setError('')
    if(!token) return ()=>ctrl.abort()
    Promise.all([
      smmRequest<{communities:SmmCommunity[]}>(token,'/communities','GET',undefined,ctrl.signal),
      smmRequest<{posts:SmmPost[]}>(token,'/posts','GET',undefined,ctrl.signal),
    ]).then(([a,b])=>{
      if(ctrl.signal.aborted)return
      setCommunities(a.communities);setPosts(b.posts);setReady(true)
    }).catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Не удалось загрузить данные.')})
    return ()=>ctrl.abort()
  },[token,reload])

  async function run(path:string,method:string,data:unknown,clear:()=>void){
    if(busy||!ready||!token)return
    setBusy(true);setError('')
    try{
      await smmRequest(token,path,method,data)
      clear();setReady(false);setReload(n=>n+1)
    }catch(e){setError(e instanceof Error?e.message:'Операция не выполнена.');setReady(false)}
    finally{setBusy(false)}
  }
  function saveCommunity(e:FormEvent){
    e.preventDefault()
    void run(communityEdit?'/communities/'+communityEdit:'/communities',communityEdit?'PATCH':'POST',
      {name,editorialPolicy:policy},()=>{setName('');setPolicy('');setCommunityEdit(null)})
  }
  function savePost(e:FormEvent){
    e.preventDefault()
    void run(postEdit?'/posts/'+postEdit.id:'/posts',postEdit?'PATCH':'POST',
      postEdit?{body,version:postEdit.current_version}:{body,communityId},
      ()=>{setBody('');setPostEdit(null);setApproval(null)})
  }

  return <section className="space-y-6">
    <header className="flex items-center gap-3"><Megaphone className="h-8 w-8"/><div><h1 className="text-2xl font-semibold text-ink">OXANA SMM</h1><p className="text-sm text-muted">Сообщества и черновики · версия 0.3</p></div></header>
    <div className={panel} role="status"><div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6"/><strong>Публикации отключены</strong></div><p className="text-sm text-muted">Согласование касается только текста. VK, MAX, изображения и платная генерация не подключены.</p></div>
    {error&&<div className={panel} role="alert"><p>{error}</p><p className="text-sm text-muted">Перед повторной записью обновите данные, чтобы проверить результат предыдущего запроса.</p></div>}
    <button className={button} disabled={busy} onClick={()=>{setApproval(null);setReload(n=>n+1)}}>Обновить данные</button>
    {!ready&&<p className="text-muted">Данные недоступны или загружаются. Запись заблокирована.</p>}
    {ready&&<>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={panel}><h2 className="font-semibold">Мои сообщества ({communities.length})</h2>
          {communities.map(c=><div key={c.id} className="border-b border-border py-3"><p className="font-medium">{c.name}</p><p className="whitespace-pre-wrap text-sm text-muted">{c.editorial_policy}</p><button className={button} disabled={busy} onClick={()=>{setCommunityEdit(c.id);setName(c.name);setPolicy(c.editorial_policy)}}>Редактировать</button></div>)}
          {!communities.length&&<p className="text-muted">Добавьте первое сообщество.</p>}
        </div>
        <form className={panel} onSubmit={saveCommunity}><h2 className="font-semibold">{communityEdit?'Настройки сообщества':'Новое сообщество'}</h2>
          <label className="block">Название<input className={input} required maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label>
          <label className="block">Тематика, аудитория, рубрики и правила<textarea className={input} rows={6} maxLength={10000} value={policy} onChange={e=>setPolicy(e.target.value)}/></label>
          <button className={button} disabled={busy||!name.trim()}>Сохранить</button>{communityEdit&&<button type="button" className={button} onClick={()=>{setCommunityEdit(null);setName('');setPolicy('')}}>Отмена</button>}
        </form>
      </div>
      <form className={panel} onSubmit={savePost}><h2 className="font-semibold">{postEdit?'Редактирование черновика · версия '+postEdit.current_version:'Новый черновик'}</h2>
        {!postEdit&&<label className="block">Сообщество<select className={input} required value={communityId} onChange={e=>setCommunityId(e.target.value)}><option value="">Выберите сообщество</option>{communities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <label className="block">Текст публикации<textarea className={input} required rows={7} maxLength={20000} value={body} onChange={e=>setBody(e.target.value)}/></label>
        <button className={button} disabled={busy||!body.trim()||(!postEdit&&!communityId)}>Сохранить черновик</button>{postEdit&&<button type="button" className={button} onClick={()=>{setPostEdit(null);setBody('')}}>Отмена</button>}
      </form>
      <div className={panel}><h2 className="font-semibold">Черновики ({posts.length})</h2>
        {posts.map(p=><article className="space-y-3 border-b border-border py-4" key={p.id}><p className="font-medium">{communities.find(c=>c.id===p.community_id)?.name??'Сообщество'}</p><p className="text-sm text-muted">Версия {p.current_version} · {p.approved?'Текст согласован':'Не согласован'}</p><p className="whitespace-pre-wrap break-words">{p.body}</p><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>{setPostEdit(p);setBody(p.body);setApproval(null)}}>Редактировать</button><button className={button} disabled={busy||p.approved||postEdit?.id===p.id} onClick={()=>setApproval(p)}>Согласовать текст</button></div></article>)}
        {!posts.length&&<p className="text-muted">Черновиков пока нет.</p>}
      </div>
      {approval&&<div className={panel} role="region" aria-label="Подтверждение текста"><h2 className="font-semibold">Подтвердить версию {approval.current_version}?</h2><p className="whitespace-pre-wrap break-words">{approval.body}</p><p className="text-sm text-muted">Это не отправит публикацию в VK.</p><button className={button} disabled={busy} onClick={()=>void run('/posts/'+approval.id+'/approve','POST',{version:approval.current_version,confirm:true},()=>setApproval(null))}>Подтверждаю текст</button><button className={button} onClick={()=>setApproval(null)}>Отмена</button></div>}
    </>}
    <div className={panel}><h2 className="font-semibold">Следующие разделы</h2><p className="text-sm text-muted">Контент-план, источники, медиатека, бюджет и аналитика — в разработке.</p></div>
  </section>
}
