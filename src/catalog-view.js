import { createAnimeCatalog, catalogTitle, mergeCatalogTitle, bestCatalogQuality } from './anime-catalog.js';
import { icon } from './icons.js';

export function catalogView({ $, node, state, onWatch, onFavorite, toast }) {
  const api=createAnimeCatalog();let activated=false;let query='';let sort='popular';let page=1;let hasMore=false;let items=[];let searchTimer;let listRequest;let listSerial=0;let releaseRequest;let releaseSerial=0;let selected;let readyTitle;let opening=false;let opener;
  const progressFor=title=>Object.hasOwn(state.progress,title.id)?state.progress[title.id]:null;
  const message=error=>error?.name==='TimeoutError'?'Каталог долго не отвечает. Попробуй ещё раз.':navigator.onLine===false?'Нет соединения с интернетом. Сохранённая библиотека остаётся на устройстве.':String(error?.message||'Не удалось загрузить каталог.').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  function feedback(title,description,retry=true){$('#catalog-feedback').hidden=false;$('#catalog-feedback-title').textContent=title;$('#catalog-feedback-description').textContent=description;$('#catalog-retry').hidden=!retry;}
  function poster(item,className){
    const holder=node('div',undefined,className);
    if(item.posterUrl){const image=node('img');image.alt='';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';image.onerror=()=>{image.remove();holder.classList.add('missing');holder.append(icon('image'));};image.src=item.posterUrl;holder.append(image);}
    else{holder.classList.add('missing');holder.append(icon('image'));}
    return holder;
  }
  function render(){
    const fragment=document.createDocumentFragment();
    for(const item of items){
      const card=node('article',undefined,'catalog-card');const open=node('button',undefined,'catalog-card-open');open.type='button';open.setAttribute('aria-label',`Открыть: ${item.title}`);const art=poster(item,'catalog-poster');
      const overlay=node('span',undefined,'catalog-poster-action');overlay.append(icon('play'),node('span','Смотреть'));art.append(overlay);
      if(item.ongoing)art.append(node('span','Выходит','catalog-status'));
      const caption=node('div',undefined,'catalog-caption');caption.append(node('h3',item.title),node('p',[item.year,item.type,item.episodes?`${item.episodes} серий`:null].filter(Boolean).join(' · '),'muted'));
      open.append(art,caption);open.onclick=()=>openRelease(item);card.append(open);fragment.append(card);
    }
    $('#catalog-grid').replaceChildren(fragment);
  }
  function skeletons(){const fragment=document.createDocumentFragment();for(let i=0;i<12;i++){const card=node('div',undefined,'catalog-skeleton');card.setAttribute('aria-hidden','true');card.append(node('div'),node('span'),node('span'));fragment.append(card);}$('#catalog-grid').replaceChildren(fragment);}
  async function load(more=false){
    clearTimeout(searchTimer);listRequest?.abort();listRequest=new AbortController();const serial=++listSerial;const targetPage=more?page+1:1;$('#catalog-feedback').hidden=true;$('#catalog-more').disabled=true;$('#catalog-grid').setAttribute('aria-busy','true');
    if(!more){items=[];skeletons();$('#catalog-count').textContent='Ищем истории для тебя…';}
    try{
      const result=await api.list({query,page:targetPage,sort,signal:listRequest.signal});if(serial!==listSerial)return;
      page=targetPage;hasMore=result.hasMore;const known=new Set(more?items.map(item=>item.id):[]);items=[...(more?items:[]),...result.items.filter(item=>!known.has(item.id)&&known.add(item.id))];render();
      $('#catalog-count').textContent=result.total===null?`${items.length} аниме`:`${new Intl.NumberFormat('ru').format(result.total)} ${query?'по запросу':'в каталоге'}`;
      if(!items.length)feedback('Пока ничего не нашлось','Попробуй русское, английское или оригинальное название.',false);
    }catch(error){if(serial===listSerial&&error.name!=='AbortError'){hasMore=false;if(!more)$('#catalog-grid').replaceChildren();feedback('Не удалось открыть каталог',message(error));$('#catalog-count').textContent='';}}
    finally{if(serial===listSerial){$('#catalog-grid').setAttribute('aria-busy','false');$('#catalog-more').hidden=!hasMore;$('#catalog-more').disabled=false;}}
  }
  $('#catalog-search').oninput=event=>{query=event.target.value.trim();clearTimeout(searchTimer);listRequest?.abort();listSerial++;searchTimer=setTimeout(()=>load(),350);};
  $('#catalog-search').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();load();}};
  for(const button of document.querySelectorAll('[data-catalog-sort]'))button.onclick=()=>{sort=button.dataset.catalogSort;for(const other of document.querySelectorAll('[data-catalog-sort]')){const active=other===button;other.classList.toggle('selected',active);other.setAttribute('aria-pressed',String(active));}load();};
  $('#catalog-more').onclick=()=>load(true);$('#catalog-retry').onclick=()=>load();
  $('#close-release').onclick=()=>$('#release-dialog').close();
  $('#release-dialog').addEventListener('close',()=>{releaseSerial++;releaseRequest?.abort();opening=false;readyTitle=null;if(opener?.checkVisibility?.())opener.focus({preventScroll:true});else if(!$('#player-section').hidden){$('#playing-title').tabIndex=-1;$('#playing-title').focus({preventScroll:true});}});
  function favoriteState(){const favorite=readyTitle&&state.favorites.includes(readyTitle.id);$('#catalog-favorite').setAttribute('aria-label',favorite?'Убрать из избранного':'В избранное');$('#catalog-favorite').title=favorite?'Убрать из избранного':'В избранное';$('#catalog-favorite').classList.toggle('is-favorite',Boolean(favorite));}
  function selection(){const progress=readyTitle&&progressFor(readyTitle);$('#catalog-play-label').textContent=progress&&progress.episodeId===$('#catalog-episode').value&&progress.time>0?'Продолжить':'Смотреть';}
  $('#catalog-episode').onchange=selection;
  function metadata(item){
    $('#release-title').textContent=item.title;$('#release-english').textContent=item.english;$('#release-art').replaceChildren(poster(item,'release-poster'));
    $('#release-meta').textContent=[item.year,item.type,item.episodes?`${item.episodes} серий`:null,item.rating?`Рейтинг ${item.rating}`:null].filter(Boolean).join(' · ');
    $('#release-genres').replaceChildren(...item.genres.map(genre=>node('span',genre)));
    $('#release-description').textContent=item.description||'Описание скоро появится.';
  }
  async function openRelease(item,{autoPlay=false,episodeId}={}){
    opener=document.activeElement;releaseRequest?.abort();releaseRequest=new AbortController();const serial=++releaseSerial;selected=item;readyTitle=null;opening=true;
    metadata(item);$('#catalog-play').disabled=true;$('#catalog-favorite').disabled=true;$('#catalog-episode').replaceChildren();$('#release-progress').textContent='';$('#release-state').textContent='Загружаем серии…';
    if(!$('#release-dialog').open)$('#release-dialog').showModal();
    try{
      const result=await api.release(item.id,{signal:releaseRequest.signal,fresh:autoPlay});if(serial!==releaseSerial)return;
      if(!result.item)throw new Error('Не удалось прочитать карточку аниме.');metadata(result.item);selected=result.item;
      readyTitle=mergeCatalogTitle(catalogTitle(result.raw),state.titles.find(t=>t.catalog?.releaseId===item.id));
      const progress=progressFor(readyTitle);const options=readyTitle.episodes.map(ep=>{const option=node('option',`Серия ${ep.number}`);option.value=ep.id;return option;});$('#catalog-episode').replaceChildren(...options);
      const preferred=episodeId||progress?.episodeId;if(preferred&&readyTitle.episodes.some(ep=>ep.id===preferred))$('#catalog-episode').value=preferred;
      const savedEpisode=progress&&readyTitle.episodes.find(e=>e.id===progress.episodeId);
      $('#release-progress').textContent=progress?savedEpisode?`Ты остановился на серии ${savedEpisode.number} · ${Math.floor(progress.time/60)}:${String(Math.floor(progress.time%60)).padStart(2,'0')}`:'Прежняя серия сейчас недоступна у провайдера.':selected.episodes&&readyTitle.episodes.length<selected.episodes?`Сейчас доступно ${readyTitle.episodes.length} из ${selected.episodes} серий.`:'';
      $('#release-state').textContent='';$('#catalog-play').disabled=false;$('#catalog-favorite').disabled=false;opening=false;favoriteState();selection();
      if(autoPlay)await watch();
    }catch(error){if(serial===releaseSerial&&error.name!=='AbortError'){$('#release-state').textContent=message(error);opening=false;const unavailable=/Серии ещё не вышли|ограничил просмотр/.test(error.message);$('#catalog-play-label').textContent=unavailable?'Пока недоступно':'Повторить';$('#catalog-play').disabled=unavailable;}}
  }
  async function watch(){
    if(opening)return;
    if(!readyTitle){if(selected)await openRelease(selected,{autoPlay:true});return;}
    const episode=readyTitle.episodes.find(ep=>ep.id===$('#catalog-episode').value)||readyTitle.episodes[0];
    const quality=bestCatalogQuality(episode,state.quality);const progress=progressFor(readyTitle);const time=progress?.episodeId===episode.id?progress.time:0;
    try{await onWatch(readyTitle,episode,time,quality);$('#release-dialog').close();}
    catch(error){$('#release-state').textContent=message(error);}
  }
  $('#catalog-play').onclick=watch;
  $('#catalog-favorite').onclick=()=>{if(!readyTitle)return;try{onFavorite(readyTitle);favoriteState();}catch(error){toast(message(error));}};
  return {
    activate(){if(!activated){activated=true;load();}},
    focus(){this.activate();$('#catalog-search').focus();},
    playSaved(title,options={}){const item={id:title.catalog.releaseId,title:title.title,posterUrl:title.posterUrl||'',english:'',genres:[],description:'',episodes:title.episodes.length};return openRelease(item,{autoPlay:true,...options});},
    pauseSearch(){clearTimeout(searchTimer);listRequest?.abort();if(!items.length)activated=false;},
  };
}
