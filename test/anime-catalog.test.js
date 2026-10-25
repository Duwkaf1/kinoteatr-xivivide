import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogTitle,catalogItem,createAnimeCatalog,mergeCatalogTitle,bestCatalogQuality} from '../src/anime-catalog.js';
import {catalogRequestURL} from '../src/catalog-provider.js';
import {requestCatalog} from '../desktop/catalog-network.js';
import {saveState,loadState} from '../src/storage.js';
const release=JSON.parse(readFileSync(new URL('./fixtures/catalog/releases.json',import.meta.url)))[0];
test('catalog operations build only bounded public API destinations, never caller URLs',()=>{
  const url=new URL(catalogRequestURL({kind:'list',query:'Фрирен',page:2,sort:'popular'}));assert.equal(url.origin,'https://anilibria.top');assert.equal(url.searchParams.get('f[search]'),'Фрирен');assert.equal(url.searchParams.get('limit'),'24');
  for(const data of [{kind:'fetch',url:'file:///secret'},{kind:'release',releaseId:'9542'},{kind:'release',releaseId:-1},{kind:'list',query:'x'.repeat(101),page:1,sort:'popular'},{kind:'list',query:'x',page:1,sort:'__proto__'}])assert.throws(()=>catalogRequestURL(data));
  assert.throws(()=>catalogRequestURL({kind:'release',releaseId:9542},'https://evil.test'));
});
test('release metadata becomes a playable title with explicit Russian sources and every available rendition',()=>{
  const title=catalogTitle(release);assert.equal(title.catalog.releaseId,release.id);assert.equal(title.episodes.length,2);assert.equal(title.episodes[1].number,2);assert.equal(title.posterUrl,catalogItem(release).posterUrl);
  assert.deepEqual(title.episodes[0].sources.map(s=>[s.voice,s.language,s.quality]),[['AniLibria','ru',1080],['AniLibria','ru',720]]);
  assert.equal(bestCatalogQuality(title.episodes[0],480),1080);
  assert.throws(()=>catalogTitle({...release,is_blocked_by_geo:true}),/ограничил/);assert.throws(()=>catalogTitle({...release,episodes:[]}),/Серии/);
  assert.throws(()=>catalogTitle({...release,episodes:[{id:'x',ordinal:1,hls_1080:'https://localhost/private.m3u8'}]}),/Серии/);
});
test('catalog persistence stores episode identities and personal data rather than expiring stream tokens',()=>{
  const title=catalogTitle(release);const first=title.episodes[0];first.subtitles=[{id:'s',label:'Мой перевод',format:'srt',language:'ru',sourceId:first.sources[0].id,content:'1\n00:00:00,000 --> 00:00:01,000\nПривет'}];
  first.sources.push({id:'manual',voice:'AniDUB',language:'ru',quality:1080,url:'https://own.test/extra.mp4'});
  const storage=new Map();const api={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  saveState({titles:[title],favorites:[title.id],progress:{[title.id]:{episodeId:first.id,time:123,updatedAt:1}},quality:1080},api);
  assert.equal(storage.get('kadr.library.v1').includes('qa.libria.fun'),false);
  const loaded=loadState(api);assert.equal(loaded.error,undefined);assert.equal(loaded.state.titles[0].episodes[0].sources[0].id,'manual');assert.equal(loaded.state.progress[title.id].time,123);
  const merged=mergeCatalogTitle(catalogTitle(release),loaded.state.titles[0]);assert.equal(merged.episodes[0].sources.length,3);assert.equal(merged.episodes[0].subtitles[0].label,'Мой перевод');
});
test('fresh metadata replaces expired URLs without losing season linkage, photos or subtitles',()=>{
  const saved=catalogTitle(release);saved.seasons=[{number:1,anidbId:128}];saved.anidbId=128;saved.episodes[0].subtitles=[{id:'s',label:'Перевод',format:'srt',language:'ru',content:'1\n00:00:00,000 --> 00:00:01,000\nТекст'}];delete saved.anilibriaId;saved.posterUrl='https://my.test/cover.jpg';
  const raw=structuredClone(release);raw.episodes[0].hls_1080+='?fresh=yes';const merged=mergeCatalogTitle(catalogTitle(raw),saved);
  assert.equal(merged.posterUrl,saved.posterUrl);assert.equal(merged.seasons[0].anidbId,128);assert.equal(merged.episodes[0].subtitles[0].label,'Перевод');assert.match(merged.episodes[0].sources[0].url,/fresh=yes/);
});
test('catalog cache is bounded by time and a requested refresh always re-fetches streams',async()=>{
  let calls=0;let now=0;const catalog=createAnimeCatalog({now:()=>now,transport:async data=>{calls++;return data.kind==='release'?release:{data:[release],meta:{pagination:{total:1,total_pages:1}}};}});
  assert.equal((await catalog.list()).items[0].id,release.id);await catalog.list();assert.equal(calls,1);now=120001;await catalog.list();assert.equal(calls,2);
  await catalog.release(release.id);await catalog.release(release.id);assert.equal(calls,3);await catalog.release(release.id,{fresh:true});assert.equal(calls,4);
  const controller=new AbortController();controller.abort();await assert.rejects(catalog.list({signal:controller.signal}));assert.equal(calls,4);
});
test('API bridge preserves TLS defaults, omits credentials and tries only official origins',async()=>{
  const requests=[];const result=await requestCatalog({kind:'release',releaseId:9542},{fetcher:async(url,options)=>{requests.push({url,options});if(requests.length===1)throw new Error('network');return new Response(JSON.stringify(release),{headers:{'Content-Type':'application/json'}});}});
  assert.equal(result.id,release.id);assert.deepEqual(requests.map(r=>new URL(r.url).hostname),['anilibria.top','aniliberty.top']);assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.redirect,'error');
});

test('a mismatched release identity cannot start the wrong anime',async()=>{
 const api=createAnimeCatalog({transport:async()=>release});
 await assert.rejects(api.release(release.id+1),/другую карточку/);
});
