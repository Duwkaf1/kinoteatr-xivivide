import {test,expect} from '@playwright/test';
import {serveCatalog,releases} from './catalog-fixtures.js';
import {contrast} from '../src/custom-theme.js';
const hex=color=>'#'+color.match(/[\d.]+/g).slice(0,3).map(x=>Math.round(Number(x)).toString(16).padStart(2,'0')).join('');
const noErrors=page=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));return errors;};

test('catalog is the home screen with automatic covers and no mandatory source or link form',async({page})=>{
 const errors=noErrors(page);await serveCatalog(page);await page.goto('http://127.0.0.1:5173');
 await expect(page.getByRole('button',{name:'Каталог',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.locator('.catalog-card')).toHaveCount(8);await expect.poll(()=>page.locator('.catalog-poster img').evaluateAll(images=>images.filter(i=>i.naturalWidth>0).length)).toBe(8);
 expect(await page.locator('header #add-button').count()).toBe(0);expect(await page.locator('[data-view=sources]').count()).toBe(0);await expect(page.locator('#add-dialog')).not.toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:'test-results/catalog-home.png'});expect(errors).toEqual([]);
});

for(const engine of ['standard','videojs'])test(`catalog search to ${engine} playback needs no links and restores the selected series after reload`,async({page})=>{
 const errors=noErrors(page);const requests=await serveCatalog(page);await page.addInitScript(engine=>localStorage.setItem('kadr.preferences.v1',JSON.stringify({autoNext:false,watching:{engine}})),engine);await page.goto('http://127.0.0.1:5173');
 await page.locator('#catalog-search').fill('Фрирен');await expect(page.locator('.catalog-card')).toHaveCount(1);
 const item=releases.find(r=>r.id===9542);await page.getByRole('button',{name:`Открыть: ${item.name.main}`,exact:true}).click();await expect(page.locator('#catalog-play')).toBeEnabled();await page.locator('#catalog-episode').selectOption('episode-9542-2');
 await page.locator('#release-dialog').screenshot({path:`test-results/catalog-release-${engine}.png`});await page.locator('#catalog-play').click();
 await expect(page.locator('#release-dialog')).not.toBeVisible();await expect(page.locator('#playback-status')).toContainText('AniLibria · 1080p · воспроизведение');await expect(page.locator('#playing-title')).toContainText('Серия 2');
 await expect.poll(()=>page.locator('video').evaluate(v=>v.videoHeight)).toBe(1080);await expect.poll(()=>page.locator('video').evaluate(v=>v.webkitAudioDecodedByteCount||0)).toBeGreaterThan(0);
 await page.locator('video').evaluate(v=>{v.pause();v.currentTime=2;});await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.playback.v1')).progress['catalog:anilibria:9542']?.time)).toBe(2);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kadr.library.v1')).titles[0]);expect(saved.catalog.releaseId).toBe(9542);expect(saved.episodes.every(e=>e.sources.length===0)).toBe(true);
 await page.reload();await page.getByRole('button',{name:'История',exact:true}).click();await page.getByRole('button',{name:`Смотреть: ${item.name.main}`,exact:true}).click();
 await expect(page.locator('#playback-status')).toContainText('воспроизведение');await page.locator('video').evaluate(v=>v.pause());await expect(page.locator('#playing-title')).toContainText('Серия 2');expect(await page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(2);
 expect(requests.filter(r=>r.searchParams.get('kind')==='release'&&r.searchParams.get('releaseId')==='9542').length).toBeGreaterThanOrEqual(2);expect(errors).toEqual([]);
});

test('reported blue custom theme corrects text contrast on each surface without discarding the chosen colors',async({page})=>{
 const errors=noErrors(page);await serveCatalog(page);await page.addInitScript(()=>{if(!localStorage.getItem('kadr.preferences.v1'))localStorage.setItem('kadr.preferences.v1',JSON.stringify({theme:'custom',custom:{background:'#0044f0',panel:'#323334',text:'#121212',accent:'#b97322',radius:28}}));});await page.goto('http://127.0.0.1:5173');await expect(page.locator('.catalog-card')).toHaveCount(8);
 const h=await page.locator('#view-title').evaluate(e=>({text:getComputedStyle(e).color,bg:getComputedStyle(document.body).backgroundColor}));expect(contrast(hex(h.text),hex(h.bg))).toBeGreaterThanOrEqual(4.5);
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await expect(page.locator('#custom-theme-editor')).toBeVisible();await expect(page.locator('#hex-background')).toHaveValue('#0044f0');
 for(const selector of ['#hex-background','#hex-panel','#hex-text','#hex-accent']){const pair=await page.locator(selector).evaluate(e=>({text:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));expect(contrast(hex(pair.text),hex(pair.bg))).toBeGreaterThanOrEqual(4.5);}
 await page.locator('#custom-theme-editor').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/custom-theme-safe.png'});await page.locator('#custom-comfort').uncheck();await expect(page.locator('body')).toHaveCSS('background-color','rgb(0, 68, 240)');await page.reload();await page.getByRole('button',{name:'Настройки',exact:true}).click();await expect(page.locator('#custom-comfort')).not.toBeChecked();await expect(page.locator('#hex-background')).toHaveValue('#0044f0');await page.locator('#custom-comfort').check();await expect(page.locator('body')).not.toHaveCSS('background-color','rgb(0, 68, 240)');expect(errors).toEqual([]);
});

test('performance slider follows a continuous pointer drag, snaps softly and keeps keyboard stops',async({page})=>{
 await serveCatalog(page);await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Настройки',exact:true}).click();
 const slider=page.locator('#performance-level');const box=await slider.boundingBox();await page.mouse.move(box.x+box.width-12,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.66,box.y+box.height/2,{steps:20});
 const intermediate=Number(await slider.inputValue());expect(intermediate).toBeGreaterThan(1.1);expect(intermediate).toBeLessThan(1.5);expect(intermediate).not.toBe(Math.round(intermediate));await page.mouse.up();await expect(slider).toHaveValue('1');
 await slider.focus();await page.keyboard.press('ArrowRight');await expect(slider).toHaveValue('2');await expect(page.locator('#performance-name')).toHaveText('Качество');
 await expect(page.locator('.performance-thumb')).toHaveCSS('transition-duration',/0\.24s/);await page.screenshot({path:'test-results/performance-smooth.png'});
 await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Home');await expect(slider).toHaveValue('0');expect(await page.locator('.performance-thumb').evaluate(e=>e.getAnimations().length)).toBe(0);
});

test('catalog errors offer retry, then recover without asking for a URL',async({page})=>{
 await serveCatalog(page,{fail:true});await page.goto('http://127.0.0.1:5173');await expect(page.locator('#catalog-feedback')).toBeVisible();await expect(page.locator('#catalog-feedback-title')).toHaveText('Не удалось открыть каталог');
 await serveCatalog(page);await page.locator('#catalog-retry').click();await expect(page.locator('.catalog-card')).toHaveCount(8);await expect(page.locator('#add-dialog')).not.toBeVisible();
});

test('catalog and release details remain inside small windows and high zoom layouts',async({page})=>{
 await serveCatalog(page);await page.setViewportSize({width:320,height:360});await page.goto('http://127.0.0.1:5173');await expect(page.locator('.catalog-card')).toHaveCount(8);
 expect(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await page.locator('.catalog-card-open').first().click();await expect(page.locator('#catalog-play')).toBeEnabled();
 const box=await page.locator('#release-dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.width+box.x).toBeLessThanOrEqual(320);expect(box.height+box.y).toBeLessThanOrEqual(360);expect(await page.locator('#release-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Настройки',exact:true}).click();expect(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});

test('empty library moon stays round and centered instead of stretching with the background',async({page})=>{
 await serveCatalog(page);await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Библиотека',exact:true}).click();
 const art=await page.locator('.hero-art').boundingBox();const moon=await page.locator('.hero-moon').boundingBox();expect(Math.abs(moon.width-moon.height)).toBeLessThan(1);expect(Math.abs(moon.x+moon.width/2-art.x-art.width/2)).toBeLessThan(1);expect(Math.abs(moon.y+moon.height/2-art.y-art.height/2)).toBeLessThan(1);
 await expect(page.locator('#hero-button-label')).toHaveText('Открыть каталог');await page.screenshot({path:'test-results/library-empty-moon.png'});
});

test('mode descriptions do not make the slider jump vertically in a narrow window',async({page})=>{
 await serveCatalog(page);await page.setViewportSize({width:320,height:480});await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(()=>localStorage.setItem('kadr.preferences.v1',JSON.stringify({interface:{textSize:120}})));await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Настройки',exact:true}).click();
 const positions=[];for(const value of ['2','1','0','2']){await page.locator('#performance-level').fill(value);positions.push(await page.locator('#performance-rail').evaluate(e=>e.getBoundingClientRect().y+document.querySelector('main').scrollTop));}
 expect(Math.max(...positions)-Math.min(...positions)).toBeLessThan(1);
});

test('a failed catalog stream retries with fresh metadata without requesting manual sources',async({page})=>{
 const requests=await serveCatalog(page);let fail=true;await page.route('https://qa.libria.fun/**',route=>fail?route.fulfill({status:503,body:'Unavailable'}):route.fallback());await page.goto('http://127.0.0.1:5173');await page.locator('.catalog-card-open').first().click();await expect(page.locator('#catalog-play')).toBeEnabled();await page.locator('#catalog-play').click();
 await expect(page.locator('#retry-button')).toBeVisible();await expect(page.locator('#playback-status')).toContainText('обновит подключение');await expect(page.locator('#add-dialog')).not.toBeVisible();
 fail=false;await page.locator('#retry-button').click();await expect(page.locator('#playback-status')).toContainText('воспроизведение');expect(requests.filter(url=>url.searchParams.get('kind')==='release').length).toBeGreaterThanOrEqual(2);await expect(page.locator('video')).toHaveCount(1);
});
