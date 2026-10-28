import {validateLibrary} from './core.js';
export function archiveVideo(item,raw){
 if(item.provider!=='archive'||raw?.metadata?.identifier!==item.sourceId||!item.language)return null;
 const files=(Array.isArray(raw.files)?raw.files:[]).filter(file=>typeof file.name==='string'&&/^[^/\\]+\.mp4$/i.test(file.name)&&!/(?:trailer|sample|preview)/i.test(file.name)&&[480,720,1080].includes(Number(file.height))&&Number(file.length)>600&&/^[a-f0-9]{32}$/i.test(file.md5||''));
 if(!files.length)return null;files.sort((a,b)=>Number(b.length)-Number(a.length)||Number(b.height)-Number(a.height));const file=files[0];
 const encoded=encodeURIComponent(file.name);const id=encodeURIComponent(item.sourceId);const urls=[`https://archive.org/download/${id}/${encoded}`];
 if(typeof raw.dir==='string'&&new RegExp(`^/\\d+/items/${item.sourceId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`).test(raw.dir))for(const host of [raw.d1,raw.d2]){
  if(typeof host==='string'&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.archive\.org$/.test(host))urls.push(`https://${host}${raw.dir}/${encoded}`);
 }
 const sources=[...new Set(urls)].map((url,index)=>({id:`archive:${item.sourceId}:${file.md5}:${index}`,url,quality:Number(file.height),language:item.language,audioType:'original',voice:'Дорожка Internet Archive',label:index?'Internet Archive · резерв':'Internet Archive'}));
 return validateLibrary([{id:item.id,title:item.title,posterUrl:item.posterUrl,discovery:{provider:'archive',media:'movie',id:item.sourceId},episodes:[{id:`archive:${file.md5}`,number:1,sources,webPlayers:[{id:'archive-page',label:'Internet Archive',url:`https://archive.org/details/${id}`}]}]}])[0];
}
