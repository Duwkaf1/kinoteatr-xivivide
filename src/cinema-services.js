export const CINEMA_SERVICES={youtube:{name:'YouTube',hint:'Поиск видео на YouTube. Полная версия может быть недоступна.'},kinopoisk:{name:'Кинопоиск',hint:'Может потребоваться подписка. Воспроизведение зависит от региона.'},rutube:{name:'Rutube',hint:'Поиск видео на Rutube. Доступность полной версии определяет сервис.'},vkvideo:{name:'VK Видео',hint:'Может потребоваться вход. Доступность видео определяет сервис.'}};
export function cinemaServiceURL(service,item,episode){
 if(!Object.hasOwn(CINEMA_SERVICES,service)||typeof item?.title!=='string'||!item.title.trim()||item.title.length>160||!['movie','series'].includes(item.media))throw new Error('Не удалось открыть сервис.');
 const year=typeof item.year==='string'?item.year.match(/\d{4}/)?.[0]||'':'';
 let query=[item.title.trim(),year].filter(Boolean).join(' ');
 if(episode){if(!Number.isInteger(episode.season)||episode.season<1||episode.season>100||!Number.isInteger(episode.number)||episode.number<1||episode.number>10000)throw new Error('Некорректная серия.');query+=` ${episode.season} сезон ${episode.number} серия`;}
 const encoded=encodeURIComponent(query);
 return {youtube:`https://www.youtube.com/results?search_query=${encoded}`,kinopoisk:`https://www.kinopoisk.ru/index.php?kp_query=${encoded}`,rutube:`https://rutube.ru/search/?query=${encoded}`,vkvideo:`https://vkvideo.ru/?q=${encoded}`}[service];
}
export function cinemaDiscovery(value){
 if(value===undefined)return undefined;
 if(!value||value.provider==='archive'&&value.media!=='movie'||value.provider==='tvmaze'&&value.media!=='series'||!['movie','series'].includes(value.media)||!['cinemeta','tvmaze','archive'].includes(value.provider)||typeof value.id!=='string'||value.id.length>180||!value.id)throw new Error('Некорректная карточка кино.');
 if(value.provider==='cinemeta'&&!/^tt\d{7,10}$/.test(value.id)||value.provider==='tvmaze'&&!/^\d{1,9}$/.test(value.id)||value.provider==='archive'&&!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$/.test(value.id))throw new Error('Некорректный идентификатор кино.');
 return {media:value.media,provider:value.provider,id:value.id};
}
export function cinemaWebURL(value){
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)throw new Error('Некорректная ссылка сервиса.');
 const allowed={'www.youtube.com':['/results','search_query'],'www.kinopoisk.ru':['/index.php','kp_query'],'rutube.ru':['/search/','query'],'vkvideo.ru':['/','q']};const rule=allowed[url.hostname];
 if(rule&&url.pathname===rule[0]&&[...url.searchParams.keys()].every(key=>key===rule[1])&&url.searchParams.get(rule[1])?.length<=260&&!url.hash)return url.href;
 if(url.hostname==='archive.org'&&/^\/details\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$/.test(url.pathname)&&!url.search&&!url.hash)return url.href;
 throw new Error('Поддерживается только поиск на выбранном видеосервисе.');
}
