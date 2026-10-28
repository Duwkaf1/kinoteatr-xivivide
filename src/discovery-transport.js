import {boundedText} from './subtitles.js';
export async function discoveryRequest(data,{signal}={}){
 signal?.throwIfAborted();
 if(globalThis.window?.kadr?.catalogRequest){const requestId=crypto.randomUUID();const cancel=()=>window.kadr.cancelCatalog(requestId);signal?.addEventListener('abort',cancel,{once:true});try{const result=await window.kadr.catalogRequest({...data,requestId});signal?.throwIfAborted();return result;}finally{signal?.removeEventListener('abort',cancel);}}
 const url=new URL('/__yoru/catalog',location.href);for(const [key,value]of Object.entries(data))url.searchParams.set(key,Array.isArray(value)?JSON.stringify(value):String(value));const response=await fetch(url,{signal,credentials:'omit'});const result=JSON.parse(await boundedText(response,6*1024*1024));if(result?.error)throw new Error(result.error);return result;
}
