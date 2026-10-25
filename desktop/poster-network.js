import { boundedText } from '../src/subtitles.js';
import { posterIdentity, verifiedLibriaPoster, verifiedMalPoster, conflictingLibriaIdentity } from '../src/poster-identity.js';
import { CATALOG_HOSTS } from '../src/catalog-provider.js';
export async function resolvePoster(raw,{releaseId,after='',fetcher,signal}) {
  const identity=posterIdentity(raw.response,releaseId);
  const get=async url=>{const response=await fetcher(url,{credentials:'omit',redirect:'error',signal,headers:{Accept:'application/json'}});return JSON.parse(await boundedText(response,2*1024*1024));};
  if(identity.alias)for(const origin of CATALOG_HOSTS){
    signal?.throwIfAborted();
    try{const release=await get(`${origin}/api/v1/anime/releases/${identity.alias}`);if(conflictingLibriaIdentity(identity,release))return {releaseId,posterUrl:null,source:null,reason:'identity-conflict'};const candidate=verifiedLibriaPoster(identity,release);if(candidate){if(!after)return candidate;break;}}
    catch(error){if(signal?.aborted)throw error;}
  }
  if(identity.mal){signal?.throwIfAborted();try{const result=await get(`https://api.jikan.moe/v4/anime/${identity.mal}`);const candidate=verifiedMalPoster(identity,result.data);if(candidate)return candidate;}catch(error){if(signal?.aborted)throw error;}}
  return {releaseId,posterUrl:null,source:null};
}
