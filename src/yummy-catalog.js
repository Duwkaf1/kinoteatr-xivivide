import genres from './yummy-genres.json' with { type: 'json' };
export const YUMMY_AGES = { Y1:'Все возрасты · G', Y2:'Для детей · PG', Y3:'От 13 лет · PG-13', Y4:'От 17 лет · R-17+', Y5:'Для взрослых · R+' };
export const YUMMY_GENRES = genres;
export const YUMMY_ORIGIN = 'https://old.yummyani.me';
export function yummyURL(data) {
  if(data.kind==='release')return `${YUMMY_ORIGIN}/api/anime/${data.releaseId}`;
  const url=new URL('/api/anime',YUMMY_ORIGIN);
  url.searchParams.set('limit',data.kind==='random'?'1':'24');url.searchParams.set('offset',String((data.page-1)*24));
  url.searchParams.set('sort',data.kind==='random'?'random':{popular:'rating',updated:'title',newest:'year'}[data.sort]);url.searchParams.set('sort_forward',data.sort==='updated'&&data.kind!=='random'?'true':'false');
  if(data.query.trim())url.searchParams.set('q',data.query.trim());
  if(data.genres?.length)url.searchParams.set('genres',data.genres.join(','));
  if(data.age)url.searchParams.set('min_age',data.age.slice(1));
  return url.href;
}
const plain = value => typeof value==='string'?value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').slice(0,6000):'';
export function yummyItem(raw) {
  if(!Number.isSafeInteger(raw?.anime_id)||raw.anime_id<1||typeof raw.title!=='string'||!raw.title.trim()||typeof raw.anime_url!=='string'||!/^[a-z0-9_-]{1,200}$/i.test(raw.anime_url))return null;
  let posterUrl='';try{const url=new URL(raw.poster?.big||raw.poster?.medium,YUMMY_ORIGIN);if(url.protocol==='https:'&&url.hostname==='static.yani.tv'&&url.pathname.startsWith('/posters/'))posterUrl=url.href;}catch{}
  const age=Object.hasOwn(YUMMY_AGES,`Y${raw.min_age?.value}`)?`Y${raw.min_age.value}`:'';
  return {provider:'yummyani',id:raw.anime_id,title:plain(raw.title).slice(0,160),english:Array.isArray(raw.other_titles)?raw.other_titles.map(plain).join(' · ').slice(0,500):'',posterUrl,year:Number.isInteger(raw.year)?raw.year:null,type:plain(raw.type?.shortname),description:plain(raw.description),genres:Array.isArray(raw.genres)?raw.genres.slice(0,12).map(g=>plain(g.title)).filter(Boolean):[],genreIds:Array.isArray(raw.genres)?raw.genres.map(g=>g.id).filter(Number.isSafeInteger):[],age,ageLabel:({Y1:'0+',Y2:'Для детей',Y3:'13+',Y4:'17+',Y5:'Для взрослых'})[age]||'',episodes:Number.isInteger(raw.episodes?.count)?raw.episodes.count:null,rating:Number.isFinite(raw.rating?.average)?Math.round(raw.rating.average*100)/100:null,ongoing:raw.anime_status?.alias==='ongoing',websiteURL:`${YUMMY_ORIGIN}/catalog/item/${raw.anime_url}`};
}
