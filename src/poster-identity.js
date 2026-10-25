import { catalogRelease } from './catalog.js';
const positive = value => Number.isSafeInteger(value) && value > 0;
export function posterIdentity(raw, expectedId) {
  if (raw?.anime_id !== expectedId || !positive(expectedId)) throw new Error('Не совпала карточка аниме.');
  const ids=raw.remote_ids||{};
  return { releaseId:expectedId, mal:positive(ids.myanimelist_id)?ids.myanimelist_id:null, shikimori:positive(ids.shikimori_id)?ids.shikimori_id:null, alias:typeof ids.anilibria_alias==='string'&&/^[a-z0-9][a-z0-9-]{0,159}$/.test(ids.anilibria_alias)?ids.anilibria_alias:null };
}
export function verifiedLibriaPoster(identity, release) {
  if(!identity.alias || release?.alias!==identity.alias)return null;
  // Every identifier supplied by Yummyani must agree. An alias/name alone is insufficient.
  if(!identity.mal&&!identity.shikimori)return null;
  if(identity.mal&&release.mal?.id!==identity.mal)return null;
  if(identity.shikimori&&release.shikimori?.id!==identity.shikimori)return null;
  const item=catalogRelease(release);return item&&new URL(item.posterUrl).pathname.startsWith(`/storage/releases/posters/${release.id}/`)?{releaseId:identity.releaseId,posterUrl:item.posterUrl,source:'anilibria',identity:{mal:identity.mal,shikimori:identity.shikimori,anilibria:release.id}}:null;
}
export function verifiedMalPoster(identity, release) {
  if(!identity.mal || release?.mal_id!==identity.mal)return null;
  try{const url=new URL(release.images?.webp?.large_image_url||release.images?.jpg?.large_image_url);if(url.protocol!=='https:'||url.hostname!=='cdn.myanimelist.net'||url.username||url.password||url.port||!/^\/images\/anime\/\d+\/[\w.-]+\.(?:webp|jpe?g|png)$/.test(url.pathname))return null;
    return {releaseId:identity.releaseId,posterUrl:url.href,source:'myanimelist',identity:{mal:identity.mal}};
  }catch{return null;}
}

export function conflictingLibriaIdentity(identity,release){
  if(!catalogRelease(release))return false;
  return release.alias!==identity.alias || Boolean(identity.mal&&positive(release.mal?.id)&&release.mal.id!==identity.mal) || Boolean(identity.shikimori&&positive(release.shikimori?.id)&&release.shikimori.id!==identity.shikimori);
}
