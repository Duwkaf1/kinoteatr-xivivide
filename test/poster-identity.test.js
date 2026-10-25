import test from 'node:test';import assert from 'node:assert/strict';
import {posterIdentity,verifiedLibriaPoster,verifiedMalPoster} from '../src/poster-identity.js';
import {requestCatalog} from '../desktop/catalog-network.js';
const target={anime_id:10661,remote_ids:{anilibria_alias:'sousou-no-frieren',shikimori_id:52991,myanimelist_id:52991}};
const libria={id:9542,alias:'sousou-no-frieren',name:{main:'Фрирен'},shikimori:{id:52991},mal:{id:52991},poster:{preview:'/storage/releases/posters/9542/cover.webp'}};
const mal={mal_id:52991,images:{webp:{large_image_url:'https://cdn.myanimelist.net/images/anime/1015/138006l.webp'}}};
test('fallback posters require the exact release and all supplied identifiers, never a similar name',()=>{
 const identity=posterIdentity(target,10661);assert.equal(verifiedLibriaPoster(identity,libria).releaseId,10661);
 for(const raw of [{...libria,alias:'sousou-no-frieren-2'},{...libria,mal:{id:59999}},{...libria,shikimori:{id:59999}},{...libria,mal:null}])assert.equal(verifiedLibriaPoster(identity,raw),null);
 assert.equal(verifiedLibriaPoster({...identity,mal:null,shikimori:null},libria),null);assert.equal(verifiedLibriaPoster(identity,{...libria,poster:{preview:'/storage/releases/posters/9999/other.webp'}}),null);assert.throws(()=>posterIdentity({...target,anime_id:15084},10661));
 assert.equal(verifiedMalPoster(identity,mal).identity.mal,52991);assert.equal(verifiedMalPoster(identity,{...mal,mal_id:59999}),null);
 for(const value of ['https://evil.test/images/anime/1/a.jpg','http://cdn.myanimelist.net/images/anime/1/a.jpg','https://cdn.myanimelist.net/avatars/user.jpg'])assert.equal(verifiedMalPoster(identity,{...mal,images:{jpg:{large_image_url:value}}}),null);
});
test('poster gateway re-fetches the selected Yummyani release and returns a verified alternative',async()=>{
 const urls=[];const result=await requestCatalog({kind:'poster',provider:'yummyani',releaseId:10661},{fetcher:async(url,options)=>{urls.push(url);assert.equal(options.credentials,'omit');return new Response(JSON.stringify(url.includes('old.yummyani')?{response:target}:libria));}});
 assert.equal(result.source,'anilibria');assert.equal(urls[0],'https://old.yummyani.me/api/anime/10661');assert.equal(urls[1],'https://anilibria.top/api/v1/anime/releases/sousou-no-frieren');assert.equal(urls.length,2);
});
test('conflicting season metadata stops all substitution; a missing primary source can use explicit MAL identity',async()=>{
 const urls=[];const result=await requestCatalog({kind:'poster',provider:'yummyani',releaseId:10661},{fetcher:async url=>{urls.push(url);return new Response(JSON.stringify(url.includes('old.yummyani')?{response:target}:url.includes('api.jikan')?{data:mal}:{...libria,mal:{id:59999}}));}});
 assert.equal(result.posterUrl,null);assert.equal(result.reason,'identity-conflict');assert.equal(urls.some(url=>url.includes('jikan')),false);
 const fallback=await requestCatalog({kind:'poster',provider:'yummyani',releaseId:10661},{fetcher:async url=>new Response(JSON.stringify(url.includes('old.yummyani')?{response:{...target,remote_ids:{myanimelist_id:52991}}}:{data:mal}))});assert.equal(fallback.source,'myanimelist');
 const empty=await requestCatalog({kind:'poster',provider:'yummyani',releaseId:10661},{fetcher:async()=>new Response(JSON.stringify({response:{anime_id:10661,remote_ids:{}}}))});assert.equal(empty.posterUrl,null);
 await assert.rejects(requestCatalog({kind:'poster',provider:'anilibria',releaseId:10661}),/Некорректный/);await assert.rejects(requestCatalog({kind:'poster',provider:'yummyani',releaseId:10661,after:'https://evil.test'}),/Некорректный/);
});

test('poster requests are bounded, stale queued work aborts, and a selected release jumps ahead of background work',async()=>{
 const {createAnimeCatalog}=await import('../src/anime-catalog.js');const order=[];const releases=new Map();let active=0,maxActive=0;
 const api=createAnimeCatalog({transport:async data=>{order.push(data.releaseId);active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>releases.set(data.releaseId,resolve));active--;return {releaseId:data.releaseId,posterUrl:null};}});
 const one=api.poster(1),two=api.poster(2);const cancel=new AbortController();const old=api.poster(3,{signal:cancel.signal}).catch(error=>error.name);const background=api.poster(4);const selected=api.poster(5,{priority:true});await new Promise(r=>setTimeout(r,0));cancel.abort();releases.get(1)();await one;await new Promise(r=>setTimeout(r,0));assert.deepEqual(order,[1,2,5]);assert.equal(await old,'AbortError');releases.get(2)();await two;await new Promise(r=>setTimeout(r,0));releases.get(5)();releases.get(4)();await Promise.all([selected,background]);assert.equal(maxActive,2);
});
