import { createAnimeCatalog, catalogTitle, mergeCatalogTitle, bestCatalogQuality } from './anime-catalog.js';
import { YUMMY_AGES } from './yummy-catalog.js';
import { CATALOG_AGES } from './catalog-provider.js';
import { icon } from './icons.js';

const searchText = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g,'е').normalize('NFKC');
export function catalogView({ $, node, state, onWatch, onFavorite, toast }) {
  const api=createAnimeCatalog();let activated=false;let query='';let sort='popular';let page=1;let hasMore=false;let items=[];let searchTimer;let listRequest;let listSerial=0;let releaseRequest;let releaseSerial=0;let selected;let readyTitle;let opening=false;let opener;let websiteReady=false;
  let provider='anilibria';let genres=[];let age='';let genreOptions=[];let genresRequest;let randomRequest;let randomSerial=0;let lastRandomId;let pending=false;
  const hideTimers=new Map();const posterRequests=new Map();const waitingPosters=new Map();let postersPaused=false;let posterDialogOpening=false;
  const posterObserver=new MutationObserver(()=>{for(const [holder,controller]of posterRequests)if(!holder.isConnected){controller.abort();posterRequests.delete(holder);}for(const holder of waitingPosters.keys())if(!holder.isConnected)waitingPosters.delete(holder);});posterObserver.observe($('#catalog-grid'),{childList:true,subtree:true});posterObserver.observe($('#release-art'),{childList:true,subtree:true});
  function resumePosters(){for(const [holder,run]of waitingPosters){if(!holder.isConnected)waitingPosters.delete(holder);else if(!postersPaused&&(!posterDialogOpening||holder.classList.contains('release-poster'))){waitingPosters.delete(holder);run();}}}
  function cancelPosters(backgroundOnly=false){for(const [holder,controller]of posterRequests)if(!backgroundOnly||holder.classList.contains('catalog-poster'))controller.abort();}
  const progressFor=title=>Object.hasOwn(state.progress,title.id)?state.progress[title.id]:null;
  const motion=()=>document.body.dataset.profile==='quality'&&!document.body.classList.contains('less-motion')&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const message=error=>error?.name==='TimeoutError'?'Каталог долго не отвечает. Попробуй ещё раз.':navigator.onLine===false?'Нет соединения с интернетом. Сохранённая библиотека остаётся на устройстве.':String(error?.message||'Не удалось загрузить каталог.').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  function feedback(title,description,retry=true){$('#catalog-feedback').hidden=false;$('#catalog-feedback-title').textContent=title;$('#catalog-feedback-description').textContent=description;$('#catalog-retry').hidden=!retry;}
  const criteria=()=>({provider,query,sort,genres:[...genres],age});
  function cancelRandom(){randomSerial++;randomRequest?.abort();$('#catalog-random').disabled=false;$('#catalog-random').setAttribute('aria-busy','false');$('#catalog-random-label').textContent='Случайное аниме';}
  function invalidate(){clearTimeout(searchTimer);listRequest?.abort();listSerial++;pending=true;hasMore=false;$('#catalog-more').hidden=true;$('#catalog-feedback').hidden=true;cancelRandom();}
  function poster(item,className){
    const holder=node('div',undefined,className);const placeholder=icon('image');
    const missing=()=>{holder.classList.add('missing');if(!placeholder.isConnected)holder.prepend(placeholder);};
    if(!item.posterUrl&&item.provider!=='yummyani'){missing();return holder;}
    const image=node('img');image.alt='';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
    const unavailable=()=>{image.remove();missing();};
    const fallback=async(after='')=>{
      unavailable();if(!holder.isConnected)return;
      if(postersPaused||(posterDialogOpening&&className==='catalog-poster')){waitingPosters.set(holder,()=>fallback(after));return;}
      posterRequests.get(holder)?.abort();const controller=new AbortController();posterRequests.set(holder,controller);
      try{const result=await api.poster(item.id,{after,priority:className==='release-poster',signal:controller.signal});if(!holder.isConnected||!result.posterUrl)return;
        image.onerror=()=>result.source==='anilibria'?fallback('anilibria'):unavailable();image.src=result.posterUrl;placeholder.remove();holder.classList.remove('missing');holder.prepend(image);
      }catch{if(controller.signal.aborted&&holder.isConnected)waitingPosters.set(holder,()=>fallback(after));}
      finally{if(posterRequests.get(holder)===controller)posterRequests.delete(holder);}
    };
    image.onerror=()=>item.provider==='yummyani'?fallback():unavailable();
    if(item.posterUrl)image.src=item.posterUrl;else queueMicrotask(()=>fallback());holder.append(image);return holder;
  }

  function cardFor(item){
    const card=node('article',undefined,'catalog-card');card.dataset.releaseId=item.id;
    const open=node('button',undefined,'catalog-card-open');open.type='button';open.setAttribute('aria-label',`Открыть: ${item.title}`);const art=poster(item,'catalog-poster');
    const overlay=node('span',undefined,'catalog-poster-action');overlay.append(icon('play'),node('span','Смотреть'));art.append(overlay);
    if(item.ongoing)art.append(node('span','Выходит','catalog-status'));if(item.ageLabel)art.append(node('span',item.ageLabel,'catalog-age'));
    const caption=node('div',undefined,'catalog-caption');caption.append(node('h3',item.title),node('p',[item.year,item.type,item.episodes?`${item.episodes} серий`:null].filter(Boolean).join(' · '),'muted'));
    if(item.genres.length)caption.append(node('p',item.genres.slice(0,3).join(' · '),'catalog-card-genres muted'));
    open.append(art,caption);open.onclick=()=>openRelease(item);card.append(open);return card;
  }
  function cancelCardMotion(card){clearTimeout(hideTimers.get(card));hideTimers.delete(card);for(const animation of card.getAnimations())animation.cancel();card.classList.remove('search-exiting');}
  function matches(item){const words=searchText(query).split(/\s+/).filter(Boolean);return words.every(word=>searchText(`${item.title} ${item.english}`).includes(word))&&(provider==='yummyani'&&!item.genreIds.length||genres.every(id=>item.genreIds.includes(id)))&&(!age||item.age===age);}
  function narrow(){
    const byId=new Map(items.map(item=>[String(item.id),item]));
    for(const card of $('#catalog-grid').querySelectorAll('.catalog-card')){
      cancelCardMotion(card);const item=byId.get(card.dataset.releaseId);const keep=item&&matches(item);card.inert=!keep;
      if(keep){const hidden=card.hidden;card.hidden=false;if(hidden&&motion())card.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:220,easing:'ease-out'});}
      else if(motion()&&!card.hidden){card.classList.add('search-exiting');hideTimers.set(card,setTimeout(()=>{card.hidden=true;hideTimers.delete(card);},180));}
      else card.hidden=true;
    }
  }
  async function render(next,serial){
    const grid=$('#catalog-grid');const old=new Map([...grid.querySelectorAll('.catalog-card')].map(card=>[Number(card.dataset.releaseId),card]));const ids=new Set(next.map(item=>item.id));
    const exiting=[...old].filter(([id,card])=>!ids.has(id)&&!card.hidden).map(([,card])=>card);
    if(motion()&&exiting.length){await Promise.all(exiting.map(card=>card.animate([{opacity:getComputedStyle(card).opacity},{opacity:0,transform:'scale(.97)'}],{duration:160,easing:'ease-out',fill:'forwards'}).finished.catch(()=>{})));}
    if(serial!==listSerial)return false;
    const rects=new Map([...old].filter(([,card])=>!card.hidden).map(([id,card])=>[id,card.getBoundingClientRect()]));const fragment=document.createDocumentFragment();
    for(const item of next){const card=old.get(item.id)||cardFor(item);cancelCardMotion(card);card.hidden=false;card.inert=false;fragment.append(card);}
    for(const card of old.values())cancelCardMotion(card);grid.replaceChildren(fragment);
    if(motion())for(const card of grid.children){const before=rects.get(Number(card.dataset.releaseId));const after=card.getBoundingClientRect();const x=before?before.x-after.x:0;const y=before?before.y-after.y:10;if(!before||Math.abs(x)+Math.abs(y)>1)card.animate([{opacity:before?1:0,transform:`translate(${x}px,${y}px)`},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.75,.25,1)'});}
    return true;
  }
  function skeletons(){const fragment=document.createDocumentFragment();for(let i=0;i<12;i++){const card=node('div',undefined,'catalog-skeleton');card.setAttribute('aria-hidden','true');card.append(node('div'),node('span'),node('span'));fragment.append(card);}$('#catalog-grid').replaceChildren(fragment);}
  async function load(more=false){
    if(more&&(pending||!hasMore))return;
    clearTimeout(searchTimer);listRequest?.abort();listRequest=new AbortController();const serial=++listSerial;const targetPage=more?page+1:1;const filters=criteria();pending=true;$('#catalog-feedback').hidden=true;$('#catalog-more').disabled=true;$('#catalog-grid').setAttribute('aria-busy','true');
    if(!more){if(!items.length)skeletons();$('#catalog-count').textContent='Ищем истории для тебя…';}
    try{
      const result=await api.list({...filters,page:targetPage,signal:listRequest.signal});if(serial!==listSerial)return;
      const known=new Set(more?items.map(item=>item.id):[]);const next=[...(more?items:[]),...result.items.filter(item=>!known.has(item.id)&&known.add(item.id))];
      if(!await render(next,serial))return;items=next;page=targetPage;hasMore=result.hasMore;
      $('#catalog-count').textContent=result.total===null?`${items.length} загружено · Yummyani`:`${new Intl.NumberFormat('ru').format(result.total)} ${query||genres.length||age?'найдено':'в каталоге'}`;
      if(!items.length)feedback('Пока ничего не нашлось','Попробуй другое название или убери часть фильтров.',false);
    }catch(error){if(serial===listSerial&&error.name!=='AbortError'){hasMore=false;if(!more){items=[];$('#catalog-grid').replaceChildren();}feedback('Не удалось открыть каталог',message(error));$('#catalog-count').textContent='';}}
    finally{if(serial===listSerial){pending=false;$('#catalog-grid').setAttribute('aria-busy','false');$('#catalog-more').hidden=!hasMore;$('#catalog-more').disabled=false;}}
  }
  function updateFilters(){const count=genres.length+Number(Boolean(age));$('#catalog-filter-badge').hidden=!count;$('#catalog-filter-badge').textContent=count;$('#catalog-reset').hidden=!count;for(const button of $('#catalog-genres').querySelectorAll('button'))button.setAttribute('aria-pressed',String(genres.includes(Number(button.dataset.genre))));}
  function filterChanged(){invalidate();updateFilters();narrow();load();}
  let genresSerial=0;
  async function loadGenres(){
    if(genresRequest)return;const serial=++genresSerial;genresRequest=new AbortController();$('#catalog-genres-state').textContent='Загружаем жанры…';$('#catalog-genres-retry').hidden=true;
    try{const result=await api.genres({provider,signal:genresRequest.signal});if(serial!==genresSerial)return;genreOptions=result;$('#catalog-genre-search').hidden=genreOptions.length<20;$('#catalog-genres').replaceChildren(...genreOptions.map(genre=>{const button=node('button',genre.name,'genre-chip');button.dataset.genre=genre.id;button.setAttribute('aria-pressed',String(genres.includes(genre.id)));button.onclick=()=>{if(genres.includes(genre.id))genres=genres.filter(id=>id!==genre.id);else if(genres.length<6)genres.push(genre.id);else{toast('Можно выбрать до шести жанров.');return;}filterChanged();};return button;}));$('#catalog-genres-state').textContent='';}
    catch(error){if(serial===genresSerial&&error.name!=='AbortError'){$('#catalog-genres-state').textContent=message(error);$('#catalog-genres-retry').hidden=false;}}
    finally{if(serial===genresSerial)genresRequest=null;}
  }
  $('#catalog-genre-search').oninput=event=>{const needle=searchText(event.target.value);for(const button of $('#catalog-genres').children)button.hidden=!searchText(button.textContent).includes(needle);};
  $('#catalog-provider').onchange=event=>{provider=event.target.value;document.querySelector('[data-catalog-sort=updated]').textContent=provider==='yummyani'?'По названию':'Обновления';genres=[];age='';genreOptions=[];genresRequest?.abort();genresRequest=null;genresSerial++;$('#catalog-genres').replaceChildren();$('#catalog-genre-search').value='';$('#catalog-genre-search').hidden=true;$('#catalog-age').replaceChildren(...[['','Любой'],...Object.entries(provider==='yummyani'?YUMMY_AGES:CATALOG_AGES)].map(([value,label])=>{const option=node('option',label);option.value=value;return option;}));$('#catalog-scope').textContent=provider==='yummyani'?'Расширенный каталог Yummyani · просмотр открывается в отдельном окне Yoru; сериями, переводами и прогрессом управляет сайт.':'Каталог AniLibria / AniLiberty · доступные релизы с русской озвучкой';items=[];invalidate();updateFilters();load();if(!$('#catalog-filters').hidden)loadGenres();};
  $('#catalog-filter-toggle').onclick=()=>{const open=$('#catalog-filters').hidden;$('#catalog-filters').hidden=!open;$('#catalog-filter-toggle').setAttribute('aria-expanded',String(open));if(open&&!genreOptions.length)loadGenres();};
  $('#catalog-genres-retry').onclick=loadGenres;
  $('#catalog-age').onchange=event=>{age=event.target.value;filterChanged();};
  $('#catalog-reset').onclick=()=>{genres=[];age='';$('#catalog-age').value='';filterChanged();};
  $('#catalog-search').oninput=event=>{query=event.target.value.trim();invalidate();narrow();$('#catalog-count').textContent='Ищем истории для тебя…';searchTimer=setTimeout(()=>load(),350);};
  $('#catalog-search').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();load();}};
  for(const button of document.querySelectorAll('[data-catalog-sort]'))button.onclick=()=>{sort=button.dataset.catalogSort;for(const other of document.querySelectorAll('[data-catalog-sort]')){const active=other===button;other.classList.toggle('selected',active);other.setAttribute('aria-pressed',String(active));}invalidate();load();};
  $('#catalog-more').onclick=()=>load(true);$('#catalog-retry').onclick=()=>load();
  $('#catalog-random').onclick=async()=>{
    cancelRandom();randomRequest=new AbortController();const serial=randomSerial;const filters=criteria();$('#catalog-random').disabled=true;$('#catalog-random').setAttribute('aria-busy','true');$('#catalog-random-label').textContent='Подбираем…';
    try{
      if(provider==='yummyani'){const item=await api.random(filters,{signal:randomRequest.signal});if(serial!==randomSerial)return;if(!item){toast('Нет аниме с такими условиями.');return;}await openRelease(item);return;}
      const first=await api.list({...filters,page:1,signal:randomRequest.signal});if(serial!==randomSerial)return;
      const total=first.total??first.items.length;if(!total||!first.items.length){toast('Нет аниме с такими условиями. Попробуй другие фильтры.');return;}
      let index=Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/4294967296*total);const targetPage=Math.floor(index/24)+1;
      const result=targetPage===1?first:await api.list({...filters,page:targetPage,signal:randomRequest.signal});if(serial!==randomSerial)return;
      let item=result.items[index%24];if(item?.id===lastRandomId&&result.items.length>1)item=result.items[(index%24+1)%result.items.length];
      if(!item)throw new Error('Каталог изменился во время выбора. Попробуй ещё раз.');lastRandomId=item.id;await openRelease(item);
    }catch(error){if(serial===randomSerial&&error.name!=='AbortError')toast(message(error));}
    finally{if(serial===randomSerial){$('#catalog-random').disabled=false;$('#catalog-random').setAttribute('aria-busy','false');$('#catalog-random-label').textContent='Случайное аниме';}}
  };
  $('#close-release').onclick=()=>$('#release-dialog').close();
  $('#release-dialog').addEventListener('close',()=>{posterDialogOpening=false;$('#release-art').replaceChildren();queueMicrotask(resumePosters);releaseSerial++;releaseRequest?.abort();opening=false;readyTitle=null;if($('#release-dialog').returnValue==='search')return;if(opener?.checkVisibility?.())opener.focus({preventScroll:true});else if(!$('#player-section').hidden){$('#playing-title').tabIndex=-1;$('#playing-title').focus({preventScroll:true});}});
  function favoriteState(){const favorite=readyTitle&&state.favorites.includes(readyTitle.id);$('#catalog-favorite').setAttribute('aria-label',favorite?'Убрать из избранного':'В избранное');$('#catalog-favorite').title=favorite?'Убрать из избранного':'В избранное';$('#catalog-favorite').classList.toggle('is-favorite',Boolean(favorite));}
  function selection(){const progress=readyTitle&&progressFor(readyTitle);$('#catalog-play-label').textContent=selected?.provider==='yummyani'?'Смотреть на Yummyani':progress&&progress.episodeId===$('#catalog-episode').value&&progress.time>0?'Продолжить':'Смотреть';}
  $('#catalog-episode').onchange=selection;
  function metadata(item){
    $('#release-title').textContent=item.title;$('#release-english').textContent=item.english;$('#release-art').replaceChildren(poster(item,'release-poster'));
    $('#release-meta').textContent=[item.ageLabel,item.year,item.type,item.episodes?`${item.episodes} серий`:null,item.rating?`Рейтинг ${item.rating}`:null].filter(Boolean).join(' · ');
    $('#release-genres').replaceChildren(...item.genres.map(genre=>node('span',genre)));
    $('#release-description').textContent=item.description||'Описание скоро появится.';
  }
  async function openRelease(item,{autoPlay=false,episodeId}={}){
    posterDialogOpening=true;cancelPosters(true);opener=document.activeElement;releaseRequest?.abort();releaseRequest=new AbortController();const serial=++releaseSerial;selected=item;readyTitle=null;websiteReady=false;opening=true;
    metadata(item);$('.release-actions').classList.toggle('website-actions',item.provider==='yummyani');$('.release-voice').textContent=item.provider==='yummyani'?'Плееры и переводы сайта Yummyani':'Русская озвучка · AniLibria';$('#catalog-favorite').hidden=item.provider==='yummyani';$('#catalog-episode').closest('label').hidden=item.provider==='yummyani';$('#catalog-play').disabled=true;$('#catalog-favorite').disabled=true;$('#catalog-episode').replaceChildren();$('#release-progress').textContent='';$('#release-state').textContent='Загружаем серии…';
    if(!$('#release-dialog').open){$('#release-dialog').returnValue='';$('#release-dialog').showModal();}
    try{
      const result=await api.release(item.id,{provider:item.provider||'anilibria',signal:releaseRequest.signal,fresh:autoPlay});if(serial!==releaseSerial)return;
      if(!result.item)throw new Error('Не удалось прочитать карточку аниме.');metadata(result.item);selected=result.item;
      if(selected.provider==='yummyani'){$('#release-state').textContent='Просмотр откроется в отдельном окне приложения. Серии, озвучку и субтитры выбираешь в плеере сайта; прогресс сохраняет сайт.';$('#catalog-play-label').textContent='Смотреть на Yummyani';$('#catalog-play').disabled=false;opening=false;websiteReady=true;if(autoPlay)await watch();return;}
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
    if(selected?.provider==='yummyani'){if(!websiteReady){await openRelease(selected,{autoPlay:true});return;}try{if(window.kadr?.openWebPlayer)await window.kadr.openWebPlayer(selected.websiteURL);else{const popup=window.open(selected.websiteURL,'_blank','noopener,noreferrer');if(popup)popup.opener=null;}$('#release-dialog').close();}catch(error){$('#release-state').textContent=message(error);}return;}
    if(!readyTitle){if(selected)await openRelease(selected,{autoPlay:true});return;}
    const episode=readyTitle.episodes.find(ep=>ep.id===$('#catalog-episode').value)||readyTitle.episodes[0];
    const quality=bestCatalogQuality(episode,state.quality);const progress=progressFor(readyTitle);const time=progress?.episodeId===episode.id?progress.time:0;
    try{await onWatch(readyTitle,episode,time,quality);$('#release-dialog').close();}
    catch(error){$('#release-state').textContent=message(error);}
  }
  $('#catalog-play').onclick=watch;
  $('#catalog-favorite').onclick=()=>{if(!readyTitle)return;try{onFavorite(readyTitle);favoriteState();}catch(error){toast(message(error));}};
  return {
    activate(){postersPaused=false;resumePosters();if(!activated){activated=true;load();}},
    focus(){this.activate();$('#catalog-search').focus();},
    playSaved(title,options={}){const item={id:title.catalog.releaseId,title:title.title,posterUrl:title.posterUrl||'',english:'',genres:[],description:'',episodes:title.episodes.length};return openRelease(item,{autoPlay:true,...options});},
    pauseSearch(){postersPaused=true;cancelPosters();clearTimeout(searchTimer);listRequest?.abort();listSerial++;cancelRandom();if(pending||!items.length)activated=false;pending=false;},
  };
}
