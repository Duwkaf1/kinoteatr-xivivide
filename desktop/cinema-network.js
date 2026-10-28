import {boundedText} from '../src/subtitles.js';
import {cinemaArgs,cinemaURL,cinemaItem} from '../src/cinema-provider.js';
const cache=new Map();let bytes=0;
async function json(url,fetcher,signal){
 signal.throwIfAborted();const old=cache.get(url);if(old&&Date.now()-old.time<120000)return old.value;
 const response=await fetcher(url,{credentials:'omit',redirect:'error',signal,headers:{Accept:'application/json'}});
 if(response.status===404&&url.startsWith('https://api.tvmaze.com/shows?page='))return [];
 const body=await boundedText(response,6*1024*1024);const value=JSON.parse(body);
 if(body.length<=2*1024*1024){while(cache.size&&(cache.size>=8||bytes+body.length>8*1024*1024)){const key=cache.keys().next().value;bytes-=cache.get(key).size;cache.delete(key);}if(old&&cache.has(url)){bytes-=old.size;cache.delete(url);}cache.set(url,{value,time:Date.now(),size:body.length});bytes+=body.length;}
 return value;
}
export async function requestCinema(data,{fetcher=globalThis.fetch,signal}={}){
 cinemaArgs(data);const timeout=AbortSignal.timeout(16000);const total=signal?AbortSignal.any([signal,timeout]):timeout;
 async function run(args,first){
  const deadline=first&&args.kind==='cinema-list'&&args.provider==='cinemeta'?AbortSignal.any([total,AbortSignal.timeout(8000)]):total;
  const get=url=>json(url,fetcher,deadline);
  if(args.kind==='cinema-genres'){const raw=await get(cinemaURL(args));const catalog=raw.catalogs?.find(item=>item.type===args.media&&item.id==='top');const options=catalog?.extra?.find(extra=>extra.name==='genre')?.options;if(!Array.isArray(options))throw new Error('Список жанров временно недоступен.');return {genres:options.filter(value=>typeof value==='string'&&value.length<=60).slice(0,80)};}
  if(args.kind==='cinema-detail'){
   const raw=await get(cinemaURL(args));const item=cinemaItem(args.provider==='cinemeta'?raw.meta:raw,args.provider,args.media);
   if(!item||item.sourceId!==args.id)throw new Error('Сервис вернул другую карточку. Повтори открытие.');
   return {item,...(args.provider==='archive'?{archive:raw}:{})};
  }
  if(args.provider==='archive'){
   const raw=await get(cinemaURL(args));if(!Array.isArray(raw.response?.docs))throw new Error('Каталог фильмов вернул неизвестный ответ.');
   const items=raw.response.docs.slice(0,24).map(r=>cinemaItem(r,'archive','movie')).filter(Boolean);return {items,hasMore:args.page*24<raw.response.numFound,total:raw.response.numFound,provider:'archive'};
  }
  const size=args.provider==='cinemeta'?100:250;const offset=(args.page-1)*24;const providerPage=Math.floor(offset/size);const within=offset%size;
  const firstRaw=await get(cinemaURL(args,providerPage));const list=raw=>args.provider==='cinemeta'?raw.metas:Array.isArray(raw)?raw:null;
  let all=list(firstRaw);if(!Array.isArray(all))throw new Error('Каталог вернул неизвестный ответ.');
  if(args.provider==='tvmaze'&&args.query.trim()){const filtered=all.map(x=>cinemaItem(x,'tvmaze','series')).filter(Boolean).filter(item=>!args.genre||item.genres.includes(args.genre));return {items:filtered.slice(offset,offset+24),hasMore:offset+24<filtered.length,total:filtered.length,provider:args.provider};}
  let more=all.length>=size;
  if(within+24>size&&more){const next=list(await get(cinemaURL(args,providerPage+1)));if(!Array.isArray(next))throw new Error('Не удалось получить следующую страницу.');all=[...all,...next];more=next.length>=size;}
  const items=all.slice(within,within+24).map(x=>cinemaItem(x,args.provider,args.media)).filter(Boolean);
  return {items:items.filter(item=>!args.genre||!item.genres.length||item.genres.includes(args.genre)),hasMore:within+24<all.length||more,total:null,provider:args.provider};
 }
 try{return await run(data,true);}catch(error){
  if(total.aborted)throw new Error('Сервис долго не отвечает. Проверь соединение и повтори попытку.');
  if(data.kind!=='cinema-list'||data.provider!=='cinemeta')throw new Error('Не удалось загрузить каталог. Попробуй другой источник или повтори позже.');
  const provider=data.media==='series'?'tvmaze':'archive';try{const result=await run({...data,provider},false);return {...result,fallback:true,fallbackMessage:`Основной каталог недоступен. Показаны результаты ${provider==='archive'?'Internet Archive':'TVmaze'}.`};}catch{throw new Error('Каталоги сейчас недоступны. Попробуй ещё раз; сохранённая библиотека остаётся на устройстве.');}
 }
}
