import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {serveCatalog} from './catalog-fixtures.js';
const yummy=JSON.parse(readFileSync(new URL('../test/fixtures/catalog/yummy.json',import.meta.url)));
const posters=JSON.parse(readFileSync(new URL('../test/fixtures/posters/catalog.json',import.meta.url)));
const cover=posters.find(p=>p.id===9542);
async function expanded(page,{conflict=false,empty=false,delay=0}={}){
 await serveCatalog(page);await page.route('https://static.yani.tv/**',route=>route.abort());
 const calls=[];await page.route('**/__yoru/catalog?**',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('provider')!=='yummyani')return route.fallback();calls.push(url);const kind=url.searchParams.get('kind');
 if(kind==='poster'){if(delay)await new Promise(resolve=>setTimeout(resolve,delay));return route.fulfill({contentType:'application/json',body:JSON.stringify({releaseId:yummy.anime_id,posterUrl:conflict?null:cover.posterUrl,source:conflict?null:'anilibria',identity:{mal:52991,shikimori:52991}})});}
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
 await serveCatalog(page);await page.addInitScript(()=>{window.__removeCalls=0;window.kadr={uninstallApp:async()=>{window.__removeCalls++;await new Promise(r=>setTimeout(r,100));return {status:window.__removeCalls===1?'cancelled':'error',message:window.__removeCalls===1?'':'Не удалось запустить удаление.'};}};});await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('#settings-advanced-tab').click();await page.locator('#uninstall-app').click();await expect(page.locator('#uninstall-app')).toBeDisabled();await expect(page.locator('#uninstall-app')).toBeEnabled();await expect(page.locator('#uninstall-status')).toBeEmpty();
 await page.locator('#uninstall-app').click();await expect(page.locator('#uninstall-status')).toContainText('Не удалось');await expect(page.locator('#uninstall-app')).toBeEnabled();expect(await page.evaluate(()=>window.__removeCalls)).toBe(2);await page.locator('.uninstall-card').screenshot({path:'test-results/settings-uninstall.png'});
 await page.setViewportSize({width:320,height:480});expect(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});
test('browser or portable preview reports unsupported removal and leaves other controls usable',async({page})=>{
 await serveCatalog(page);await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('#settings-advanced-tab').click();await page.locator('#uninstall-app').click();await expect(page.locator('#uninstall-status')).toContainText('Windows-версии');await page.getByRole('button',{name:'Каталог',exact:true}).click();await expect(page.locator('.catalog-card')).toHaveCount(8);
});

test('a second failed poster source reaches the exact MAL fallback and preserves card controls',async({page})=>{
 await expanded(page);const malURL='https://cdn.myanimelist.net/images/anime/1015/138006l.webp';await page.route(cover.posterUrl,route=>route.abort());await page.route(malURL,route=>route.fulfill({contentType:'image/webp',body:readFileSync(new URL(`../test/fixtures/posters/${cover.file}`,import.meta.url))}));
 await page.route('**/__yoru/catalog?**',route=>{const url=new URL(route.request().url());if(url.searchParams.get('kind')!=='poster'||url.searchParams.get('after')!=='anilibria')return route.fallback();return route.fulfill({contentType:'application/json',body:JSON.stringify({releaseId:yummy.anime_id,posterUrl:malURL,source:'myanimelist',identity:{mal:52991}})});});
 await page.locator('#catalog-provider').selectOption('anilibria');await page.locator('#catalog-provider').selectOption('yummyani');await expect(page.locator('.catalog-poster img')).toHaveAttribute('src',malURL);await expect.poll(()=>page.locator('.catalog-poster img').evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);await expect(page.locator('.catalog-age')).toHaveText('13+');await page.locator('.catalog-card-open').click();await expect(page.locator('#release-title')).toHaveText(yummy.title);
});
