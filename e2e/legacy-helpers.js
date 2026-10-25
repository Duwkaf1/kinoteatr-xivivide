// Regression coverage for existing personal libraries. Catalog workflows have
// their own integration suite; these checks explicitly navigate to the library.
export async function legacyLibrary(page) {
  await page.getByRole('button',{name:'Библиотека',exact:true}).click();
}
export async function legacyOpen(page,url='http://127.0.0.1:5173') {
  await page.route('**/__yoru/catalog?**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:[],meta:{pagination:{total:0,total_pages:1}}})}));
  await page.goto(url);await legacyLibrary(page);
}
export async function manualAdd(page) {
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.locator('#settings-advanced-tab').click();
  if(!await page.locator('#legacy-data').evaluate(e=>e.open))await page.locator('#legacy-data > summary').click();
  await page.locator('#add-button').click();
}
