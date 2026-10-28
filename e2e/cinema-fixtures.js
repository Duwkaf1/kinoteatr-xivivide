import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ARCHIVE_LICENSES} from '../src/cinema-provider.js';
import {serveCatalog} from './catalog-fixtures.js';
export const cinema=JSON.parse(readFileSync(new URL('../test/fixtures/cinema/catalog.json',import.meta.url)));
export const movieBytes=readFileSync(new URL('../test/fixtures/playback/tone.mp4',import.meta.url));
export const archive={metadata:{identifier:'owned-cinema-fixture',title:'Проверочный фильм',description:'Собственный короткий видеофрагмент для проверки плеера и резервных серверов.',year:'2026',language:'eng',licenseurl:ARCHIVE_LICENSES[0]},dir:'/1/items/owned-cinema-fixture',d1:'ia800111.us.archive.org',d2:'ia600111.us.archive.org',files:[{name:'movie.mp4',height:'1080',length:'1200',md5:createHash('md5').update(movieBytes).digest('hex')}]};
export async function serveCinema(page,{fail=false,delay=0}={}){
 await serveCatalog(page);const requests=[];
 await page.route('**/__yoru/catalog?**',async route=>{const url=new URL(route.request().url());const kind=url.searchParams.get('kind');if(!kind?.startsWith('cinema-'))return route.fallback();requests.push(url);if(delay)await new Promise(r=>setTimeout(r,delay));if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Каталоги сейчас недоступны.'})});
 const {cinemaItem}=await import('../src/cinema-provider.js');const provider=url.searchParams.get('provider');const media=url.searchParams.get('media');
 let result;
 if(kind==='cinema-genres')result={genres:['Drama','Crime']};
 else if(provider==='archive')result=kind==='cinema-detail'?{item:cinemaItem(archive,'archive','movie'),archive}:{items:[cinemaItem(archive,'archive','movie')],hasMore:false,total:1,provider:'archive'};
 else{const raw=(media==='series'?cinema.series:cinema.movies).metas;result=kind==='cinema-detail'?{item:cinemaItem(raw.find(item=>item.id===url.searchParams.get('id')),'cinemeta',media)}:{items:raw.filter(item=>item.name.toLowerCase().includes((url.searchParams.get('query')||'').toLowerCase())).map(item=>cinemaItem(item,'cinemeta',media)),hasMore:false,total:null,provider};}
 return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.route('https://images.metahub.space/**',route=>route.abort());
 await page.route('https://archive.org/services/img/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720"><rect width="480" height="720" fill="#24282e"/><rect x="40" y="40" width="400" height="640" rx="28" fill="#30363e"/><path d="M200 260L320 340L200 420Z" fill="#e5c18c"/><text x="240" y="510" text-anchor="middle" font-family="sans-serif" fill="#f4efe7" font-size="24">Тестовый фильм</text></svg>'}));
 for(const origin of ['https://archive.org/download/','https://ia800111.us.archive.org/','https://ia600111.us.archive.org/'])await page.route(origin+'**',route=>{const match=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);const start=match?Number(match[1]):0;const end=match?.[2]?Math.min(Number(match[2]),movieBytes.length-1):movieBytes.length-1;const headers={'access-control-allow-origin':'*','accept-ranges':'bytes'};if(match)headers['content-range']=`bytes ${start}-${end}/${movieBytes.length}`;return route.fulfill({status:match?206:200,contentType:'video/mp4',headers,body:movieBytes.subarray(start,end+1)});});
 return requests;
}
