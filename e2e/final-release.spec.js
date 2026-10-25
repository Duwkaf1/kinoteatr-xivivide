import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {serveCatalog} from './catalog-fixtures.js';
const yummy=JSON.parse(readFileSync(new URL('../test/fixtures/catalog/yummy.json',import.meta.url)));
const posters=JSON.parse(readFileSync(new URL('../test/fixtures/posters/catalog.json',import.meta.url)));
const cover=posters.find(p=>p.id===9542);
async function expanded(page,{conflict=false,empty=false,delay=0,second=false}={}){
 await serveCatalog(page);await page.route('https://static.yani.tv/**',route=>route.abort());
 const calls=[];await page.route('**/__yoru/catalog?**',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('provider')!=='yummyani')return route.fallback();calls.push(url);const kind=url.searchParams.get('kind');
 if(kind==='poster'){if(delay)await new Promise(resolve=>setTimeout(resolve,delay));return route.fulfill({contentType:'application/json',body:JSON.stringify({releaseId:yummy.anime_id,posterUrl:conflict?null:second?(url.searchParams.get('after')==='anilibria'?'https://cdn.myanimelist.net/images/anime/1015/138006l.webp':'https://anilibria.top/storage/releases/posters/9542/failed.webp'):cover.posterUrl,source:conflict?null:second&&url.searchParams.get('after')==='anilibria'?'myanimelist':'anilibria',identity:{mal:52991,shikimori:52991}})});}
 return route.fulfill({contentType:'application/json',body:JSON.stringify({response:kind==='release'?yummy:[{...yummy,...(empty?{poster:{}}:{})}]})});});
 await page.goto('http://127.0.0.1:5173');await page.locator('#catalog-provider').selectOption('yummyani');return calls;
}
test('broken and missing Yummyani covers use a verified alternative without losing age badges or opening another anime',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await expanded(page,{empty:true});const image=page.locator('.catalog-poster img');await expect(image).toHaveAttribute('src',cover.posterUrl);await expect.poll(()=>image.evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);await expect(page.locator('.catalog-age')).toHaveText('13+');await expect(page.locator('.catalog-poster-action')).toHaveText('Смотреть');
 await page.locator('.catalog-card-open').click();await expect(page.locator('#release-title')).toHaveText(yummy.title);await expect(page.locator('#release-art img')).toHaveAttribute('src',cover.posterUrl);await page.locator('#release-dialog').screenshot({path:'test-results/catalog-fallback-poster.png'});expect(errors).toEqual([]);
});
test('conflicting poster identities remain a placeholder and a late fallback cannot change the other catalog',async({page})=>{
 await expanded(page,{conflict:true});await expect(page.locator('.catalog-poster.missing')).toBeVisible();await expect(page.locator('.catalog-age')).toHaveText('13+');await expect(page.locator('.catalog-poster img')).toHaveCount(0);
 await expanded(page,{delay:200});await page.locator('#catalog-provider').selectOption('anilibria');await expect(page.locator('.catalog-card')).toHaveCount(8);await page.waitForTimeout(300);await expect(page.locator('.catalog-card')).toHaveCount(8);expect(await page.locator('.catalog-card').first().getAttribute('data-release-id')).toBe('9542');
});
test('full removal settings button handles cancellation, launch failure and repeated clicks without losing the profile',async({page})=>{
 await serveCatalog(page);await page.addInitScript(()=>{window.__removeCalls=0;window.kadr={uninstallApp:async()=>{window.__removeCalls++;await new Promise(r=>setTimeout(r,100));return {status:window.__removeCalls===1?'cancelled':'error',message:window.__removeCalls===1?'':'Не удалось запустить удаление.'};}};});await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('#settings-advanced-tab').click();await page.locator('#uninstall-app').click();await expect(page.locator('#uninstall-app')).toBeDisabled();await expect(page.locator('#uninstall-app')).toBeEnabled();await expect(page.locator('#uninstall-status')).toBeEmpty();await page.locator('.uninstall-card').screenshot({path:'test-results/settings-uninstall.png'});
 await page.locator('#uninstall-app').click();await expect(page.locator('#uninstall-status')).toContainText('Не удалось');await expect(page.locator('#uninstall-app')).toBeEnabled();expect(await page.evaluate(()=>window.__removeCalls)).toBe(2);
 await page.setViewportSize({width:320,height:480});expect(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});
test('browser or portable preview reports unsupported removal and leaves other controls usable',async({page})=>{
 await serveCatalog(page);await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('#settings-advanced-tab').click();await page.locator('#uninstall-app').click();await expect(page.locator('#uninstall-status')).toContainText('Windows-версии');await page.getByRole('button',{name:'Каталог',exact:true}).click();await expect(page.locator('.catalog-card')).toHaveCount(8);
});

test('a second failed poster source reaches the exact MAL fallback and preserves card controls',async({page})=>{
 const malURL='https://cdn.myanimelist.net/images/anime/1015/138006l.webp';await page.route('https://anilibria.top/storage/releases/posters/9542/failed.webp',route=>route.abort());await page.route(malURL,route=>route.fulfill({contentType:'image/webp',body:readFileSync(new URL(`../test/fixtures/posters/${cover.file}`,import.meta.url))}));await expanded(page,{second:true});await expect(page.locator('.catalog-poster img')).toHaveAttribute('src',malURL);await expect.poll(()=>page.locator('.catalog-poster img').evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);await expect(page.locator('.catalog-age')).toHaveText('13+');await page.locator('.catalog-card-open').click();await expect(page.locator('#release-title')).toHaveText(yummy.title);
});

test('opening a release cancels stalled background cover work and loads its own exact poster first',async({page})=>{
 await serveCatalog(page);await page.route('https://static.yani.tv/**',route=>route.abort());const stalled=[];
 await page.route('**/__yoru/catalog?**',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('provider')!=='yummyani')return route.fallback();const kind=url.searchParams.get('kind');const id=Number(url.searchParams.get('releaseId'));if(kind==='poster'){if(id!==yummy.anime_id){stalled.push(id);await new Promise(r=>setTimeout(r,1200));}return route.fulfill({contentType:'application/json',body:JSON.stringify({releaseId:id,posterUrl:cover.posterUrl,source:'anilibria'})});}return route.fulfill({contentType:'application/json',body:JSON.stringify({response:kind==='release'?yummy:[{...yummy,anime_id:1,title:'Фоновая история 1'},{...yummy,anime_id:2,title:'Фоновая история 2'},yummy]})});});
 await page.goto('http://127.0.0.1:5173');await page.locator('#catalog-provider').selectOption('yummyani');await expect.poll(()=>stalled.length).toBe(2);await page.getByRole('button',{name:'Открыть: '+yummy.title,exact:true}).click();await expect(page.locator('#release-art img')).toHaveAttribute('src',cover.posterUrl,{timeout:800});await expect.poll(()=>page.locator('#release-art img').evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);await page.keyboard.press('Escape');await page.getByRole('button',{name:'Каталог',exact:true}).click();
});
