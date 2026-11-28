import type { PoolClient } from 'pg'
import { probeMunicipalSources, titleDate } from './municipalReader.js'
type Results=Awaited<ReturnType<typeof probeMunicipalSources>>
export async function saveMunicipalScan(db:PoolClient,owner:string,results:Results){
 for(const s of results){
  await db.query('INSERT INTO smm.municipal_checks(owner_id,source_id,status,diagnostic,link_count,article_count) VALUES($1,$2,$3,$4,$5,$6)',[owner,s.id,s.status,s.diagnostic,s.links.length,s.articles.length])
  for(const a of s.articles){
   // Failed parses must never overwrite previously observed metadata.
   if(a.status!=='review_required'||a.url.length>2000)continue
   await db.query(`INSERT INTO smm.municipal_notices AS n(owner_id,source_id,url,title,title_date,address_match)
    VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(owner_id,source_id,url) DO UPDATE SET title=EXCLUDED.title,title_date=EXCLUDED.title_date,address_match=EXCLUDED.address_match,last_seen=now(),
    last_changed=CASE WHEN (n.title,n.title_date,n.address_match) IS DISTINCT FROM (EXCLUDED.title,EXCLUDED.title_date,EXCLUDED.address_match) THEN now() ELSE n.last_changed END`,
    [owner,s.id,a.url,a.title,titleDate(a.title),a.addressMatch])
  }
 }
}
