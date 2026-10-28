import {cinemaServiceURL,cinemaWebURL} from '../src/cinema-services.js';
export const SERVICE_PROBES={youtube:'https://www.youtube.com/robots.txt',kinopoisk:'https://www.kinopoisk.ru/robots.txt',rutube:'https://rutube.ru/robots.txt',vkvideo:'https://vkvideo.ru/robots.txt',cinemeta:'https://v3-cinemeta.strem.io/manifest.json',tvmaze:'https://api.tvmaze.com/shows/1',archive:'https://archive.org/robots.txt'};
export async function probeCinema(fetcher=globalThis.fetch){
 const results=[];const entries=Object.entries(SERVICE_PROBES);let next=0;
 await Promise.all(Array.from({length:3},async()=>{while(next<entries.length){const [service,url]=entries[next++];const start=Date.now();try{const response=await fetcher(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(4500)});await response.body?.cancel();results.push({service,status:response.ok?'reachable':response.status===401||response.status===403||response.status===429?'restricted':'unavailable',httpStatus:response.status,elapsed:Date.now()-start});}catch{results.push({service,status:'unavailable',httpStatus:null,elapsed:Date.now()-start});}}}));return {checkedAt:new Date().toISOString(),scope:'service-pages-only',results};
}
export async function openCinemaService(data,{openExternal}){const url=cinemaServiceURL(data?.service,data?.item,data?.episode);await openExternal(url);return {opened:true,service:data.service,target:'browser'};}
export function externalCinemaLink(value){try{return cinemaWebURL(value);}catch{return null;}}
