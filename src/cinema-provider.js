export const CINEMA_PROVIDERS=['cinemeta','tvmaze','archive'];
export const CINEMA_GENRES={Action:'Боевик',Adventure:'Приключения',Animation:'Анимация',Biography:'Биография',Comedy:'Комедия',Crime:'Криминал',Documentary:'Документальный',Drama:'Драма',Family:'Семейный',Fantasy:'Фэнтези',History:'История',Horror:'Ужасы',Music:'Музыка',Mystery:'Детектив',Romance:'Мелодрама','Sci-Fi':'Фантастика','Science Fiction':'Фантастика',Sport:'Спорт',Thriller:'Триллер',War:'Военный',Western:'Вестерн'};
export const ARCHIVE_LICENSES=['https://creativecommons.org/publicdomain/mark/1.0/','https://creativecommons.org/publicdomain/zero/1.0/','https://creativecommons.org/licenses/by/4.0/','https://creativecommons.org/licenses/by-sa/4.0/'];
export function cinemaArgs(data){
 if(!data||!['cinema-list','cinema-detail','cinema-genres'].includes(data.kind)||!['movie','series'].includes(data.media)||!CINEMA_PROVIDERS.includes(data.provider)||data.provider==='archive'&&data.media!=='movie'||data.provider==='tvmaze'&&data.media!=='series')throw new Error('Неизвестный раздел кино.');
 if(data.kind==='cinema-genres'){if(data.provider!=='cinemeta')throw new Error('Жанры этого каталога не запрашиваются.');return data;}
 if(data.kind==='cinema-list'){
  if(typeof data.query!=='string'||data.query.length>100||!Number.isInteger(data.page)||data.page<1||data.page>1000||typeof data.genre!=='string'||data.genre.length>60||/[\u0000-\u001f\u007f]/.test(data.genre))throw new Error('Некорректные условия поиска.');
 }else if(data.provider==='cinemeta'?!/^tt\d{7,10}$/.test(data.id):data.provider==='tvmaze'?!/^\d{1,9}$/.test(data.id):!validArchiveId(data.id))throw new Error('Не удалось определить фильм или сериал.');
 return data;
}
export function validArchiveId(id){return typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$/.test(id)&&id!=='.'&&id!=='..';}
export function cinemaURL(data,providerPage=0){
 cinemaArgs(data);
 if(data.kind==='cinema-genres')return 'https://v3-cinemeta.strem.io/manifest.json';
 if(data.provider==='cinemeta'){
  if(data.kind==='cinema-detail')return `https://v3-cinemeta.strem.io/meta/${data.media}/${data.id}.json`;
  const extra=[];if(data.query.trim())extra.push(`search=${encodeURIComponent(data.query.trim())}`);if(data.genre)extra.push(`genre=${encodeURIComponent(data.genre)}`);if(providerPage)extra.push(`skip=${providerPage*100}`);
  return `https://v3-cinemeta.strem.io/catalog/${data.media}/top${extra.length?'/'+extra.join('&'):''}.json`;
 }
 if(data.provider==='tvmaze'){
  if(data.kind==='cinema-detail')return `https://api.tvmaze.com/shows/${data.id}?embed=episodes`;
  return data.query.trim()?`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(data.query.trim())}`:`https://api.tvmaze.com/shows?page=${providerPage}`;
 }
 if(data.kind==='cinema-detail')return `https://archive.org/metadata/${encodeURIComponent(data.id)}`;
 const url=new URL('https://archive.org/advancedsearch.php');
 const licenses=ARCHIVE_LICENSES.map(license=>`licenseurl:"${license}"`).join(' OR ');
 const genre=data.genre?` AND subject:"${data.genre.replace(/["\\]/g,' ')}"`:'';
 const terms=data.query.trim().split(/\s+/).filter(Boolean).map(term=>`title:"${term.replace(/["\\]/g,' ')}"`).join(' AND ');
 url.searchParams.set('q',`mediatype:movies AND collection:feature_films AND (${licenses})${terms?' AND '+terms:''}${genre}`);
 for(const field of ['identifier','title','year','description','licenseurl','language','subject'])url.searchParams.append('fl[]',field);
 url.searchParams.set('output','json');url.searchParams.set('rows','24');url.searchParams.set('page',String(data.page));url.searchParams.set('sort[]','downloads desc');return url.href;
}
const text=value=>typeof value==='string'?value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').slice(0,6000):'';
function image(value,hosts){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&hosts.includes(url.hostname)?url.href:'';}catch{return '';}}
export function cinemaItem(raw,provider,media){
 if(provider==='cinemeta'){
  if(!raw||!/^tt\d{7,10}$/.test(raw.id)||typeof raw.name!=='string'||!text(raw.name).trim()||raw.type&&raw.type!==media)return null;
  const rating=Number(raw.imdbRating);return {id:`${media}:${raw.id}`,sourceId:raw.id,provider,media,title:text(raw.name).slice(0,160),year:text(raw.releaseInfo).slice(0,30),description:text(raw.description),posterUrl:image(raw.poster,['images.metahub.space','image.tmdb.org','m.media-amazon.com']),genres:Array.isArray(raw.genres)?raw.genres.filter(x=>typeof x==='string').slice(0,15):[],rating:Number.isFinite(rating)&&rating>0&&rating<=10?rating:null,imdbId:raw.id,episodes:(Array.isArray(raw.videos)?raw.videos:[]).slice(0,2000).filter(ep=>Number.isInteger(ep.season)&&ep.season>0&&ep.season<=100&&Number.isInteger(ep.episode)&&ep.episode>0).map(ep=>({id:`${raw.id}:${ep.season}:${ep.episode}`,season:ep.season,number:ep.episode,title:text(ep.title).slice(0,160)}))};
 }
 if(provider==='tvmaze'){
  const item=raw?.show||raw;if(!Number.isSafeInteger(item?.id)||item.id<1||typeof item.name!=='string'||!text(item.name).trim())return null;const imdbId=/^tt\d{7,10}$/.test(item.externals?.imdb)?item.externals.imdb:null;
  return {id:imdbId?`series:${imdbId}`:`series:tvmaze:${item.id}`,sourceId:String(item.id),provider,media:'series',title:text(item.name).slice(0,160),year:text(item.premiered).slice(0,4),description:text(item.summary),posterUrl:image(item.image?.original||item.image?.medium,['static.tvmaze.com']),genres:Array.isArray(item.genres)?item.genres.filter(x=>typeof x==='string').slice(0,15):[],rating:typeof item.rating?.average==='number'?item.rating.average:null,imdbId,episodes:(Array.isArray(item._embedded?.episodes)?item._embedded.episodes:[]).slice(0,2000).filter(ep=>Number.isInteger(ep.season)&&ep.season>0&&ep.season<=100&&Number.isInteger(ep.number)&&ep.number>0).map(ep=>({id:`tvmaze:${item.id}:${ep.season}:${ep.number}`,season:ep.season,number:ep.number,title:text(ep.name).slice(0,160)}))};
 }
 const item=raw?.metadata||raw;const identifier=raw?.metadata?raw.metadata.identifier:raw.identifier;
 if(!validArchiveId(identifier)||typeof item.title!=='string'||!text(item.title).trim())return null;const license=Array.isArray(item.licenseurl)?item.licenseurl[0]:item.licenseurl;
 if(!ARCHIVE_LICENSES.includes(license))return null;
 const lang=Array.isArray(item.language)?item.language[0]:item.language;
 return {id:`movie:archive:${identifier}`,sourceId:identifier,provider:'archive',media:'movie',title:text(item.title).slice(0,160),year:String(item.year||'').slice(0,4),description:text(Array.isArray(item.description)?item.description[0]:item.description),posterUrl:`https://archive.org/services/img/${encodeURIComponent(identifier)}`,genres:[],rating:null,imdbId:null,episodes:[],language:({English:'en',english:'en',eng:'en',en:'en',Russian:'ru',russian:'ru',rus:'ru',ru:'ru'})[lang]||null,license};
}
