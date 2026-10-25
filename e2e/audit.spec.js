import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const media = readFileSync(new URL('../test/fixtures/tone.webm', import.meta.url));
const episode = (id='1') => ({ id, number:Number(id), sources:[{id:'main',voice:'AniDUB',language:'ru',quality:1080,url:'https://audit.example.test/tone.webm'}] });
const title = (id='audit') => ({ id,title:'Проверка аудита',episodes:[episode()] });
async function seed(page,titles,extra={}) { await page.addInitScript(({titles,extra})=>{localStorage.setItem('kadr.library.v1',JSON.stringify({titles,favorites:[],progress:{},quality:1080}));for(const [k,v]of Object.entries(extra))localStorage.setItem(k,v);},{titles,extra}); }
async function open(page) { await page.goto(process.env.YORU_AUDIT_URL || 'http://127.0.0.1:5173'); }
async function serve(page) { await page.route('https://audit.example.test/**',route=>{
  const match=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);const start=match?Number(match[1]):0;const end=match?.[2]?Math.min(Number(match[2]),media.length-1):media.length-1;
  return route.fulfill({status:match?206:200,contentType:'video/webm',headers:{'access-control-allow-origin':'*','accept-ranges':'bytes',...(match?{'content-range':`bytes ${start}-${end}/${media.length}`}:{})},body:media.subarray(start,end+1)});
}); }
async function play(page) { await page.getByRole('button',{name:'Смотреть: Проверка аудита',exact:true}).click();await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('video').evaluate(v=>v.pause()); }

test('audit: null AniDB configuration cannot prevent application startup', async ({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await seed(page,[],{'yoru.anidb.client':'null'});await open(page);
  await expect.poll(()=>page.evaluate(()=>typeof document.querySelector('#hero-button').onclick),{timeout:3000}).toBe('function');
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await expect(page.locator('#settings-view')).toBeVisible();expect(errors).toEqual([]);
});

test('audit: adding beyond 500 titles is rejected before changing or saving the library', async ({page})=>{
  const titles=Array.from({length:500},(_,i)=>({...title(`full-${i}`),title:`История ${i}`}));await seed(page,titles);await open(page);
  await page.getByRole('button',{name:'Добавить аниме',exact:true}).click();await page.locator('#add-form [name=title]').fill('Лишнее аниме');await page.locator('#add-form [name=url]').fill('https://audit.example.test/tone.webm');
  await page.getByRole('button',{name:'Добавить',exact:true}).click();await expect(page.locator('#form-error')).toContainText('500');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.library.v1')).titles.length)).toBe(500);
  await page.reload();await expect(page.locator('#library-count')).toHaveText('500');await expect(page.locator('.anime-card')).toHaveCount(24);
});

test('audit: importing while watching preserves later subtitle and cast edits on the active title', async ({page})=>{
  await seed(page,[title()]);await serve(page);await open(page);await play(page);
  await page.locator('#import-file').setInputFiles({name:'extra.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{...title('another'),title:'Ещё история'}]))});await expect(page.locator('#toast')).toContainText('Добавлено аниме: 1');
  await page.locator('#open-player-settings').click();await page.locator('#edit-media').click();await page.locator('#add-subtitle-form [name=label]').fill('Сохранённый перевод');await page.locator('#subtitle-file').setInputFiles({name:'subs.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:00,000 --> 00:00:08,000\nЭтот перевод сохранён')});await page.getByRole('button',{name:'Добавить перевод',exact:true}).click();await expect(page.locator('#existing-subtitles')).toContainText('Сохранённый перевод');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.library.v1')).titles.find(t=>t.id==='audit').episodes[0].subtitles?.[0]?.label)).toBe('Сохранённый перевод');
  await page.locator('#close-media-dialog').click();await page.locator('#cast-panel > summary').click();await page.locator('#open-cast-settings').click();await page.locator('#anidb-id').fill('https://anidb.net/anime/128');await page.locator('#bind-anidb').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.library.v1')).titles.find(t=>t.id==='audit').seasons?.[0]?.anidbId)).toBe(128);
});

test('audit: same-name subtitle variants keep their exact selection through styling, engine changes and reload', async ({page})=>{
  const data=title();data.episodes[0].subtitles=['a','b'].map((id,i)=>({id,label:'Переводчик не указан',language:'ru',format:'srt',content:`1\n00:00:00,000 --> 00:00:08,000\nВариант ${i+1}`}));
  await seed(page,[data]);await serve(page);await open(page);await play(page);await page.locator('#subtitle-selector').selectOption('b');
  await page.locator('#open-player-settings').click();await page.locator('.subtitle-appearance > summary').click();await page.locator('#subtitle-size').fill('120');await page.locator('#subtitle-size').blur();await expect(page.locator('#subtitle-selector')).toHaveValue('b');
  await page.locator('#player-engine').selectOption('videojs');await expect(page.locator('#subtitle-selector')).toHaveValue('b');await page.locator('#close-player-settings').click();
  await page.reload();await play(page);await expect(page.locator('#subtitle-selector')).toHaveValue('b');
});

test('audit: combined minimum-size and 200-percent zoom layout keeps player controls inside the window', async ({page})=>{
  await seed(page,[title()]);await serve(page);await page.setViewportSize({width:320,height:240});await open(page);await play(page);
  for(const selector of ['#quality','#open-player-settings','#next-button']){
    const box=await page.locator(selector).boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
  }
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('#performance-level').fill('0');
  const text=await page.locator('#performance-name').boundingBox();expect(text.x+text.width).toBeLessThanOrEqual(320);
});

async function heldVideo(page) {
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('https://audit.example.test/**',async route=>{await gate;await route.fulfill({contentType:'video/webm',headers:{'access-control-allow-origin':'*'},body:media}).catch(()=>{});});
  return release;
}

test('quality loader animates Miku only while waiting and releases all animations when video starts', async ({page})=>{
  await seed(page,[title()]);const release=await heldVideo(page);await open(page);
  try {
    const sprite=page.waitForResponse(r=>r.url().endsWith('/quality/miku-dance.png'));
    await page.getByRole('button',{name:'Смотреть: Проверка аудита',exact:true}).click();await expect(page.locator('#playback-loading')).toHaveClass(/quality-loading/);await (await sprite).finished();
    await expect(page.locator('.miku-sprite')).toHaveCSS('animation-name','miku-dance');
    const position=await page.locator('.miku-sprite').evaluate(e=>getComputedStyle(e).backgroundPosition);
    await expect.poll(()=>page.locator('.miku-sprite').evaluate(e=>getComputedStyle(e).backgroundPosition)).not.toBe(position);
    await page.locator('#video-host').screenshot({path:'test-results/loading-miku.png'});
    release();await expect(page.locator('#playback-status')).toContainText('воспроизведение');await expect(page.locator('#playback-loading')).toHaveCount(0);
    expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.animationName==='miku-dance'||a.animationName==='loading-orbit').length)).toBe(0);
  } finally {release();}
});

for(const mode of ['economy','balanced','manual','reduced','disabled'])test(`loader does not request Miku or run sprite animations in ${mode}`,async({page})=>{
  const assets=[];page.on('request',r=>{if(r.url().includes('/quality/miku-dance.png'))assets.push(r.url());});
  await seed(page,[title()],{'kadr.preferences.v1':JSON.stringify({profile:['reduced','disabled'].includes(mode)?'quality':mode,animations:mode!=='disabled'})});if(mode==='reduced')await page.emulateMedia({reducedMotion:'reduce'});
  const release=await heldVideo(page);await open(page);
  try{await page.getByRole('button',{name:'Смотреть: Проверка аудита',exact:true}).click();await expect(page.locator('#playback-loading')).toBeVisible();await expect(page.locator('#playback-loading')).not.toHaveClass(/quality-loading/);await expect(page.locator('.miku-sprite')).toHaveCSS('animation-name','none');expect(assets).toEqual([]);}
  finally{release();}
});

test('changing mode, hiding the window and closing a waiting player stop quality animations',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await seed(page,[title()]);const release=await heldVideo(page);await open(page);
  try{
    await page.getByRole('button',{name:'Смотреть: Проверка аудита',exact:true}).click();await expect(page.locator('#playback-loading')).toHaveClass(/quality-loading/);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#playback-loading')).toHaveCount(0);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#playback-loading')).toHaveClass(/quality-loading/);
    await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('#performance-level').fill('0');await expect(page.locator('#playback-loading')).not.toHaveClass(/quality-loading/);
    expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.animationName==='miku-dance'||a.animationName==='loading-orbit').length)).toBe(0);
    await page.getByRole('button',{name:'Закрыть плеер',exact:true}).click();await expect(page.locator('#playback-loading')).toHaveCount(0);expect(errors).toEqual([]);
  }finally{release();}
});

for (const action of ['add','subtitle']) test(`storage failure during ${action} keeps playback usable and never reports a false save`, async ({page}) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await seed(page,[title()]); await serve(page); await open(page);
  if(action==='subtitle') await play(page);
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='kadr.library.v1')throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,key,value);};
  });
  if(action==='add'){
    await page.getByRole('button',{name:'Добавить аниме',exact:true}).click();
    await page.locator('#add-form [name=title]').fill('Только в памяти');
    await page.locator('#add-form [name=url]').fill('https://audit.example.test/tone.webm');
    await page.getByRole('button',{name:'Добавить',exact:true}).click();
    await expect(page.locator('#library-count')).toHaveText('2');
  }else{
    await page.locator('#open-player-settings').click();await page.locator('#edit-media').click();
    await page.locator('#subtitle-file').setInputFiles({name:'subs.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:00,000 --> 00:00:08,000\nТолько в памяти')});
    await page.getByRole('button',{name:'Добавить перевод',exact:true}).click();
    await expect(page.locator('#existing-subtitles')).toContainText('Переводчик не указан');
    await page.locator('#close-media-dialog').click();await page.locator('video').evaluate(v=>v.play());
    await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  }
  await expect(page.locator('#toast')).toContainText('только до закрытия');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.library.v1')));
  expect(saved.titles).toHaveLength(1);expect(saved.titles[0].episodes[0].subtitles).toBeUndefined();expect(errors).toEqual([]);
});

test('mixed button sequences keep the library, settings, dialogs and player operational', async ({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const data=title();data.episodes.push(episode('2'));await seed(page,[data],{'kadr.preferences.v1':JSON.stringify({autoNext:false})});await serve(page);await open(page);
  for(let iteration=0;iteration<6;iteration++){
    for(const name of ['Избранное','История','Источники','Настройки'])await page.getByRole('button',{name,exact:true}).click();
    await page.locator(`#settings-${iteration%2?'advanced':'basic'}-tab`).click();
    await page.locator('#settings-basic-tab').click();await page.locator('#performance-level').fill(String(iteration%3));
    await page.locator(`input[name=theme][value=${['night','oled','nord','sakura','cream','custom'][iteration]}]`).check();
    await page.getByRole('button',{name:'Добавить аниме',exact:true}).click();await page.locator('#choose-add-poster').click();await page.locator('#cancel-poster').click();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Библиотека',exact:true}).click();await play(page);
    if(iteration>0){if(!await page.locator('#episode-picker').evaluate(e=>e.open))await page.locator('#episode-picker > summary').click();await page.locator('#episode-list button').first().click();await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('video').evaluate(v=>v.pause());}
    await page.locator('#open-player-settings').click();await page.locator('#player-engine').selectOption(iteration%2?'videojs':'standard');await page.locator('#close-player-settings').click();
    await page.locator('video').evaluate(v=>{v.muted=!v.muted;});
    await page.locator('#next-button').click();await expect(page.locator('#playing-title')).toContainText('Серия 2');
    await page.getByRole('button',{name:'Закрыть плеер',exact:true}).click();
    await expect(page.locator('video')).toHaveCount(0);await expect(page.locator('#playback-loading')).toHaveCount(0);await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
  await page.reload();await expect(page.locator('#library-count')).toHaveText('1');expect(errors).toEqual([]);
});
