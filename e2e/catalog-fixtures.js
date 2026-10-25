import { readFileSync } from 'node:fs';
const releases=JSON.parse(readFileSync(new URL('../test/fixtures/catalog/releases.json',import.meta.url)));
const posters=JSON.parse(readFileSync(new URL('../test/fixtures/posters/catalog.json',import.meta.url)));
export { releases };
export async function serveCatalog(page,{delay=0,fail=false}={}){
  const requests=[];
  await page.route('**/__yoru/catalog?**',async route=>{
    const url=new URL(route.request().url());requests.push(url);
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Каталог сейчас не отвечает.'})});
    if(url.searchParams.get('kind')==='release'){
      const item=releases.find(r=>r.id===Number(url.searchParams.get('releaseId')));
      return route.fulfill({contentType:'application/json',body:JSON.stringify(item||{})});
    }
    const search=(url.searchParams.get('query')||'').toLocaleLowerCase('ru');const data=releases.filter(r=>[r.name.main,r.name.english].some(name=>name.toLocaleLowerCase('ru').includes(search)));
    return route.fulfill({contentType:'application/json',body:JSON.stringify({data,meta:{pagination:{total:data.length,total_pages:1}}})});
  });
  for(const item of posters)await page.route(item.posterUrl,route=>route.fulfill({contentType:'image/webp',body:readFileSync(new URL(`../test/fixtures/posters/${item.file}`,import.meta.url))}));
  await page.route('https://qa.libria.fun/**',route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);const headers={'access-control-allow-origin':'*'};
    if(name.startsWith('master'))return route.fulfill({headers,contentType:'application/vnd.apple.mpegurl',body:`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=250000,RESOLUTION=${name.includes('720')?'1280x720':'1920x1080'}\nindex.m3u8\n`});
    if(!['index.m3u8','segment0.ts','segment1.ts','segment2.ts'].includes(name))return route.abort();
    return route.fulfill({headers,contentType:name.endsWith('.ts')?'video/mp2t':'application/vnd.apple.mpegurl',body:readFileSync(new URL(`../test/fixtures/playback/${name}`,import.meta.url))});
  });
  return requests;
}
