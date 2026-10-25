import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function smokeCatalog({ application, page, root }) {
  const releases=JSON.parse(await readFile(path.join(root,'test/fixtures/catalog/releases.json'),'utf8'));
  const release=releases.find(item=>item.id===9542);const posterCatalog=JSON.parse(await readFile(path.join(root,'test/fixtures/posters/catalog.json'),'utf8'));
  for(const poster of posterCatalog)await page.route(poster.posterUrl,async route=>route.fulfill({contentType:'image/webp',body:await readFile(path.join(root,'test/fixtures/posters',poster.file))}));
  await application.evaluate(({net},release)=>{
    const previous=net.fetch;globalThis.__catalogRequests=[];
    net.fetch=async(url,options)=>{
      if(!/^https:\/\/(anilibria|aniliberty)\.top\/api\/v1\/anime\//.test(url))return previous(url,options);
      globalThis.__catalogRequests.push(url);
      if(options.credentials!=='omit'||options.redirect!=='error')throw new Error('Unsafe catalog transport options');
      const parsed=new URL(url);const body=parsed.pathname.includes('/releases/')?release:{data:[release],meta:{pagination:{total:1,total_pages:1}}};
      return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
    };
  },release);
  const files=new Map();for(const name of ['index.m3u8','segment0.ts','segment1.ts','segment2.ts'])files.set(name,await readFile(path.join(root,'test/fixtures/playback',name)));
  await page.route('https://qa.libria.fun/**',route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);const headers={'access-control-allow-origin':'*'};
    if(name.startsWith('master'))return route.fulfill({headers,contentType:'application/vnd.apple.mpegurl',body:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=250000,RESOLUTION=1920x1080\nindex.m3u8\n'});
    const body=files.get(name);return body?route.fulfill({headers,contentType:name.endsWith('.ts')?'video/mp2t':'application/vnd.apple.mpegurl',body}):route.abort();
  });
  await page.reload();await page.waitForSelector('.catalog-card');
  assert.equal(await page.locator('[data-view=sources]').count(),0);assert.equal(await page.locator('header #add-button').count(),0);
  await page.locator('#catalog-search').fill('Фрирен');await page.getByRole('button',{name:`Открыть: ${release.name.main}`,exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#catalog-play').disabled);await page.locator('#catalog-episode').selectOption('episode-9542-2');await page.locator('#catalog-play').click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.videoHeight===1080&&v.currentTime>.1&&v.webkitAudioDecodedByteCount>0;},undefined,{timeout:15000});
  await page.locator('video').evaluate(v=>{v.pause();v.currentTime=2;});await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadr.playback.v1')).progress['catalog:anilibria:9542']?.time===2);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.library.v1')).titles.find(t=>t.catalog?.releaseId===9542));assert.ok(saved.episodes.every(e=>!e.sources.length));
  const blocked=await page.evaluate(async()=>{try{await window.kadr.catalogRequest({requestId:'unsafe-request',kind:'release',releaseId:'https://evil.test'});return false;}catch{return true;}});assert.equal(blocked,true,'Catalog bridge rejects arbitrary destinations');
  await page.reload();await page.getByRole('button',{name:'История',exact:true}).click();await page.getByRole('button',{name:`Смотреть: ${release.name.main}`,exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.currentTime>=2&&v.videoHeight===1080;},undefined,{timeout:15000});await page.locator('video').evaluate(v=>v.pause());
  assert.ok((await page.locator('#playing-title').textContent()).includes('Серия 2'));
  const requests=await application.evaluate(()=>globalThis.__catalogRequests);assert.ok(requests.filter(url=>url.includes('/releases/9542')).length>=2);
  await page.getByRole('button',{name:'Закрыть плеер',exact:true}).click();
  console.log('PASS: native catalog search, typed IPC, automatic posters/episodes/HLS audio-video playback, expiring URL refresh and resume without link entry');
}
