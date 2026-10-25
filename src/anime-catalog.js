import { boundedText } from './subtitles.js';
import { catalogRelease } from './catalog.js';
import { validateLibrary } from './core.js';
import { yummyItem, YUMMY_GENRES } from './yummy-catalog.js';
import { CATALOG_AGES, catalogFilters } from './catalog-provider.js';

export const CATALOG_SOURCE_PREFIX = 'catalog:anilibria:';
export function catalogItem(raw) {
  if (!Number.isSafeInteger(raw?.id) || raw.id < 1 || typeof raw.name?.main !== 'string' || !raw.name.main.trim()) return null;
  const poster = catalogRelease(raw);
  const plain = value => typeof value === 'string' ? value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').slice(0, 6000) : '';
  return { provider:'anilibria',id: raw.id, title: raw.name.main.trim().slice(0,160), english: plain(raw.name.english).slice(0,160), posterUrl: poster?.posterUrl || '', year: Number.isInteger(raw.year) ? raw.year : null, type: plain(raw.type?.description).slice(0,30), description: plain(raw.description), genres: Array.isArray(raw.genres) ? raw.genres.slice(0,6).map(g=>plain(g.name)).filter(Boolean) : [], age: Object.hasOwn(CATALOG_AGES,raw.age_rating?.value) ? raw.age_rating.value : '', ageLabel: CATALOG_AGES[raw.age_rating?.value] || '', genreIds: Array.isArray(raw.genres) ? raw.genres.map(g=>g.id).filter(Number.isSafeInteger) : [], episodes: Number.isFinite(raw.episodes_total) ? raw.episodes_total : null, rating: Number.isFinite(raw.shikimori?.rating) ? raw.shikimori.rating : null, blocked: raw.is_blocked_by_geo === true || raw.is_blocked_by_copyrights === true, ongoing: raw.is_ongoing === true };
}
export function catalogTitle(raw) {
  const item = catalogItem(raw); if (!item) throw new Error('Не удалось прочитать карточку аниме.');
  if (item.blocked) throw new Error('Провайдер ограничил просмотр этого аниме в текущем регионе.');
  if (!Array.isArray(raw.episodes)) throw new Error('Каталог не вернул список серий.');
  const episodes = raw.episodes.slice(0,2000).flatMap(ep => {
    if (typeof ep.id !== 'string' || !ep.id || !Number.isFinite(ep.ordinal) || ep.ordinal < 0) return [];
    const sources = [1080,720,480].flatMap(quality => {
      const value = ep[`hls_${quality}`]; if (typeof value !== 'string' || !value) return [];
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.port || url.username || url.password || !(url.hostname.endsWith('.libria.fun') || ['libria.fun','anilibria.top','aniliberty.top'].includes(url.hostname))) return [];
        return [{id:`${CATALOG_SOURCE_PREFIX}${ep.id}:${quality}`,url:url.href,language:'ru',voice:'AniLibria',audioType:'dub',quality,label:'AniLibria'}];
      } catch {return [];}
    });
    return sources.length ? [{id:ep.id,number:ep.ordinal,sources}] : [];
  }).sort((a,b)=>a.number-b.number);
  if (!episodes.length) throw new Error('Серии ещё не вышли или пока недоступны у провайдера.');
  return validateLibrary([{id:`catalog:anilibria:${item.id}`,title:item.title,catalog:{provider:'anilibria',releaseId:item.id},...(item.posterUrl?{posterUrl:item.posterUrl,anilibriaId:item.id}:{}),episodes}])[0];
}
export function bestCatalogQuality(episode, preferred = 1080) {
  const available=[...new Set(episode.sources.filter(s=>s.language==='ru'&&s.audioType!=='original').map(s=>s.quality))].sort((a,b)=>b-a);
  return available.includes(preferred) ? preferred : available[0];
}
export function mergeCatalogTitle(fresh, saved) {
  if (!saved) return fresh;
  const episodes = fresh.episodes.map(ep=>{
    const old=saved.episodes.find(e=>e.id===ep.id);
    return {...ep,...(old?.subtitles?{subtitles:old.subtitles.filter(t=>!t.sourceId||ep.sources.some(s=>s.id===t.sourceId)||old.sources.some(s=>!s.id.startsWith(CATALOG_SOURCE_PREFIX)&&s.id===t.sourceId))}:{}),...(old?.webPlayers?{webPlayers:old.webPlayers}:{}),sources:[...ep.sources,...(old?.sources||[]).filter(s=>!s.id.startsWith(CATALOG_SOURCE_PREFIX))]};
  });
  return validateLibrary([{...fresh,...(saved.anidbId?{anidbId:saved.anidbId}:{}),...(saved.seasons?{seasons:saved.seasons}:{}),...(!saved.anilibriaId&&saved.posterUrl?{posterUrl:saved.posterUrl}:{}),episodes}])[0];
}
export function createAnimeCatalog({ transport, now = Date.now } = {}) {
  const cache = new Map(); let cacheBytes=0;
  async function request(data,signal){
    if(transport)return transport(data,{signal});
    if(globalThis.window?.kadr?.catalogRequest){
      const requestId=crypto.randomUUID(); const cancel=()=>window.kadr.cancelCatalog(requestId);
      signal?.throwIfAborted(); signal?.addEventListener('abort',cancel,{once:true});
      try {const result=await window.kadr.catalogRequest({...data,requestId});signal?.throwIfAborted();return result;}
      finally{signal?.removeEventListener('abort',cancel);}
    }
    const url=new URL('/__yoru/catalog',location.href);
    for(const [key,value]of Object.entries(data))url.searchParams.set(key,Array.isArray(value)?JSON.stringify(value):String(value));
    const response=await fetch(url,{signal,credentials:'omit'});
    if(!response.ok)throw new Error('Каталог сейчас не отвечает. Попробуй ещё раз немного позже.');
    const body=JSON.parse(await boundedText(response));if(body?.error)throw new Error(body.error);return body;
  }
  async function load(key,data,normalize,{signal,fresh=false}={}){
    signal?.throwIfAborted();const hit=cache.get(key);if(!fresh&&hit&&now()-hit.time<120000)return hit.value;
    const result=normalize(await request(data,signal));signal?.throwIfAborted();
    const size=JSON.stringify(result).length;
    if(hit){cache.delete(key);cacheBytes-=hit.size;}
    while(cache.size && (cache.size>=16 || cacheBytes+size>4*1024*1024)){const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).size;cache.delete(oldest);}
    if(size<=4*1024*1024){cache.set(key,{value:result,size,time:now()});cacheBytes+=size;}
    return result;
  }
  return {
    genres({provider='anilibria',...options}={}){if(provider==='yummyani')return Promise.resolve(YUMMY_GENRES);return load('genres',{kind:'genres'},raw=>{
      if(!Array.isArray(raw))throw new Error('Не удалось загрузить жанры.');
      return raw.slice(0,100).filter(g=>Number.isSafeInteger(g?.id)&&g.id>0&&typeof g.name==='string').map(g=>({id:g.id,name:g.name.slice(0,60)})).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    },options);},
    list({query='',page=1,sort='popular',genres=[],age='',provider='anilibria',...options}={}){
      const filters=catalogFilters({genres,age});
      return load(`list:${provider}:${query.toLocaleLowerCase('ru')}:${page}:${sort}:${filters.genres.join(',')}:${age}`,{kind:'list',provider,query,page,sort,...filters},raw=>{
      if(provider==='yummyani'){if(!Array.isArray(raw?.response)||raw.warnings?.length)throw new Error('Не удалось применить условия поиска Yummyani.');return {items:raw.response.slice(0,24).map(yummyItem).filter(item=>item&&filters.genres.every(id=>item.genreIds.includes(id))&&(!age||item.age===age)),total:null,hasMore:raw.response.length>=24};}
      if(!Array.isArray(raw?.data))throw new Error('Каталог вернул неизвестный ответ. Попробуй ещё раз.');
      const pagination=raw.meta?.pagination;
      return {items:raw.data.slice(0,24).map(catalogItem).filter(Boolean),total:Number.isFinite(pagination?.total)?pagination.total:null,hasMore:Number.isInteger(pagination?.total_pages)&&page<pagination.total_pages};
    },options);},
    random(filters,options={}){return load(`random:${Math.random()}`,{...filters,kind:'random',provider:'yummyani',page:1},raw=>{if(!Array.isArray(raw?.response)||raw.warnings?.length)throw new Error('Не удалось подобрать аниме.');return raw.response.map(yummyItem).find(item=>item&&filters.genres.every(id=>item.genreIds.includes(id))&&(!filters.age||item.age===filters.age))||null;},{...options,fresh:true});},
    release(releaseId,{provider='anilibria',...options}={}){return load(`release:${provider}:${releaseId}`,{kind:'release',provider,releaseId},raw=>{const item=provider==='yummyani'?yummyItem(raw.response):catalogItem(raw);if(!item||item.id!==releaseId)throw new Error('Каталог вернул другую карточку. Попробуй открыть аниме ещё раз.');return {item,raw};},options);},
  };
}
