import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const media=readFileSync(new URL('../test/fixtures/playback/tone.mp4',import.meta.url));
const origin='https://recovery.example.test';
const source=(id,voice='AniDUB',extra={})=>({id,voice,language:'ru',quality:1080,url:`${origin}/${id}.mp4`,...extra});
const title=sources=>({id:'recovery',title:'Проверка восстановления',episodes:[{id:'s1e1',number:1,season:1,sources:[source('unused')]},{id:'s2e7',number:7,season:2,sources}]});
async function seed(page,data,engine='standard',playback={}){
  await page.addInitScript(({data,engine,playback})=>{
    if(!localStorage.getItem('kadr.library.v1'))localStorage.setItem('kadr.library.v1',JSON.stringify({titles:[data],favorites:[],progress:{[data.id]:{episodeId:'s2e7',time:3,updatedAt:1}},quality:1080}));
    if(!localStorage.getItem('kadr.preferences.v1'))localStorage.setItem('kadr.preferences.v1',JSON.stringify({autoNext:false,watching:{engine},playback:{volume:55,speed:1.25,...playback}}));
  },{data,engine,playback});
}
function fulfill(route){
  const match=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);const start=match?Number(match[1]):0;const end=match?.[2]?Math.min(Number(match[2]),media.length-1):media.length-1;
  if(start>=media.length)return route.fulfill({status:416,headers:{'content-range':`bytes */${media.length}`}});
  return route.fulfill({status:match?206:200,contentType:'video/mp4',headers:{'access-control-allow-origin':'*','accept-ranges':'bytes',...(match?{'content-range':`bytes ${start}-${end}/${media.length}`}:{})},body:media.subarray(start,end+1)});
}
async function open(page){await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Смотреть: Проверка восстановления',exact:true}).click();}
for(const engine of ['standard','videojs']){
  test(`${engine}: actual thirty-second timeout switches provider once with the same voice, episode and saved position`,async({page})=>{
    test.setTimeout(45000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const requests=[];let release;const gate=new Promise(resolve=>{release=resolve;});
    await seed(page,title([source('hung'),source('other-voice','AniLibria'),source('same-voice'),source('foreign','AniDUB',{language:'en'}),source('low','AniDUB',{quality:720})]),engine,{attempts:5});
    await page.route(`${origin}/**`,async route=>{const name=new URL(route.request().url()).pathname;requests.push({name,at:performance.now()});if(name==='/hung.mp4'){await gate;return fulfill(route).catch(()=>{});}return fulfill(route);});
    try{
      await open(page);await expect(page.locator('#playing-title')).toContainText('Сезон 2 · Серия 7');
      await expect(page.locator('#playback-status')).toContainText('воспроизведение',{timeout:38000});await page.locator('video').evaluate(v=>v.pause());
      expect(await page.locator('#source-player').inputValue()).toBe('same-voice');
      const elapsed=requests.find(r=>r.name==='/same-voice.mp4').at-requests.find(r=>r.name==='/hung.mp4').at;
      expect(elapsed).toBeGreaterThanOrEqual(29000);expect(elapsed).toBeLessThan(38000);
      expect(requests.some(r=>['/other-voice.mp4','/foreign.mp4','/low.mp4'].includes(r.name))).toBe(false);
      const state=await page.locator('video').evaluate(v=>({time:v.currentTime,volume:v.volume,rate:v.playbackRate}));
      expect(state.time).toBeGreaterThanOrEqual(3);expect(state.time).toBeLessThan(4.5);expect(state.volume).toBe(.55);expect(state.rate).toBe(1.25);
      expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.playback.v1')).progress.recovery.episodeId)).toBe('s2e7');expect(errors).toEqual([]);
    }finally{release();}
  });

  test(`${engine}: selected studio and sound survive failover; reload keeps season and timing`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=[];
    await seed(page,title([source('dub'),source('lib-failed','AniLiberty'),source('lib-backup','AniLibria.TV'),source('foreign','English',{language:'en'}),source('low','AniDUB',{quality:720})]),engine,{attempts:1});
    await page.route(`${origin}/**`,route=>{const name=new URL(route.request().url()).pathname;requests.push(name);return name==='/lib-failed.mp4'?route.fulfill({status:503,body:'Unavailable'}):fulfill(route);});
    await open(page);await expect(page.locator('#playback-status')).toContainText('воспроизведение');
    await page.locator('video').evaluate(v=>{v.pause();v.currentTime=2;v.muted=true;v.volume=.37;v.playbackRate=1.5;});
    await expect.poll(()=>page.locator('video').evaluate(v=>!v.seeking&&Math.abs(v.currentTime-2)<.1)).toBe(true);
    await page.locator('#open-player-settings').click();await page.locator('#source-player').selectOption('lib-failed');await page.locator('#close-player-settings').click();
    await expect(page.locator('#playback-status')).toContainText('AniLibria.TV · 1080p · пауза');
    await expect(page.locator('#source-player')).toHaveValue('lib-backup');expect(requests.filter(p=>p==='/dub.mp4').length).toBe(1);
    expect(await page.locator('video').evaluate(v=>({time:v.currentTime,paused:v.paused,muted:v.muted,volume:v.volume,rate:v.playbackRate}))).toEqual({time:2,paused:true,muted:true,volume:.37,rate:1.5});
    await page.locator('video').evaluate(v=>v.dispatchEvent(new Event('error')));
    await expect(page.locator('#playback-status')).toContainText('AniDUB · 1080p · пауза');await expect(page.locator('#source-player')).toHaveValue('dub');await expect(page.locator('#toast')).toContainText('Переключаю на AniDUB');
    expect(await page.locator('video').evaluate(v=>v.currentTime)).toBe(2);
    await page.getByRole('button',{name:'Закрыть плеер',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Смотреть: Проверка восстановления',exact:true}).click();
    await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('video').evaluate(v=>v.pause());await expect(page.locator('#playing-title')).toContainText('Сезон 2 · Серия 7');
    expect(await page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(2);
    expect(requests.some(p=>['/foreign.mp4','/low.mp4'].includes(p))).toBe(false);expect(errors).toEqual([]);
  });
}

test('cast includes main and secondary characters first and keeps their notes after reload',async({page})=>{
  await seed(page,title([source('dub')]));await page.route(`${origin}/**`,fulfill);await open(page);await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('video').evaluate(v=>v.pause());
  await page.locator('#cast-panel > summary').click();await page.locator('#open-cast-settings').click();await page.locator('#anidb-id').fill('https://anidb.net/anime/123');await page.locator('#bind-anidb').click();
  const xml='<anime id="123"><titles><title type="main">Сезон два</title></titles><characters><character id="2" type="secondary cast in"><name>Второстепенная героиня</name></character><character id="3" type="appears in"><name>Гость</name></character><character id="1" type="main character in"><name>Главная героиня</name></character></characters><episodes/></anime>';
  await page.locator('#anidb-xml').setInputFiles({name:'cast.xml',mimeType:'application/xml',buffer:Buffer.from(xml)});await page.locator('#done-cast-settings').click();
  await expect(page.locator('.cast-card h3')).toHaveText(['Главная героиня','Второстепенная героиня','Гость']);
  await expect(page.locator('.character-role')).toHaveText(['Главный персонаж','Второстепенный персонаж','Эпизодическая роль']);
  await page.locator('.character-note').nth(1).fill('Запомнить этого персонажа');await page.locator('.character-note').nth(1).blur();
  await page.reload();await page.getByRole('button',{name:'Смотреть: Проверка восстановления',exact:true}).click();await page.locator('#cast-panel > summary').click();
  await expect(page.locator('.cast-card h3').nth(1)).toHaveText('Второстепенная героиня');await expect(page.locator('.character-note').nth(1)).toHaveValue('Запомнить этого персонажа');
});

test('different anime keep independent season, episode and timing after restarting the application',async({page})=>{
  const a=title([source('season-two')]);const b={id:'second',title:'Другое аниме',episodes:[{id:'only',number:1,sources:[source('second')]}]};
  await page.addInitScript(({a,b})=>{if(!localStorage.getItem('kadr.library.v1'))localStorage.setItem('kadr.library.v1',JSON.stringify({titles:[a,b],favorites:[],progress:{},quality:1080}));localStorage.setItem('kadr.preferences.v1',JSON.stringify({autoNext:false}));},{a,b});
  await page.route(`${origin}/**`,fulfill);await open(page);await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('#next-button').click();await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await page.locator('video').evaluate(v=>{v.pause();v.currentTime=2.75;});
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.playback.v1')).progress.recovery.time)).toBe(2.75);
  await page.getByRole('button',{name:'Смотреть: Другое аниме',exact:true}).click();await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('video').evaluate(v=>{v.pause();v.currentTime=1;});
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.playback.v1')).progress.second.time)).toBe(1);
  await page.reload();await page.getByRole('button',{name:'Смотреть: Проверка восстановления',exact:true}).click();await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('video').evaluate(v=>v.pause());
  await expect(page.locator('#playing-title')).toContainText('Сезон 2 · Серия 7');expect(await page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(2.75);
  await page.getByRole('button',{name:'Смотреть: Другое аниме',exact:true}).click();await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('video').evaluate(v=>v.pause());
  await expect(page.locator('#playing-title')).toHaveText('Другое аниме · Серия 1');expect(await page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(1);
});
