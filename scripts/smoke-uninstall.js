import { _electron as electron } from '@playwright/test';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
if(process.platform!=='win32'||process.env.CI!=='true'||!process.env.YORU_SMOKE_EXECUTABLE)throw new Error('Full uninstall test requires a disposable Windows CI installation.');
const executable=path.resolve(process.env.YORU_SMOKE_EXECUTABLE);
let application;
try{
  application=await electron.launch({executablePath:executable,args:['--disable-gpu'],timeout:30000});const page=await application.firstWindow();
  await page.waitForFunction(()=>typeof document.querySelector('#uninstall-app')?.onclick==='function');
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('#settings-advanced-tab').click();
  const availability=await page.evaluate(()=>window.kadr.uninstallStatus());assert.equal(availability.available,true,availability.message);
  await application.evaluate(({dialog})=>{dialog.showMessageBox=async(_window,options)=>{globalThis.__uninstallConfirm=options;return {response:0};};});
  await page.locator('#uninstall-app').click();await page.waitForFunction(()=>!document.querySelector('#uninstall-app').disabled);
  const confirm=await application.evaluate(()=>globalThis.__uninstallConfirm);assert.equal(confirm.cancelId,0);assert.equal(confirm.defaultId,0);assert.match(confirm.detail,/библиотека.*история.*заметки/i);assert.ok((await stat(executable)).isFile());
  console.log('PASS: in-app uninstall cancellation leaves the installation and profile intact');
  await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
  const closed=application.waitForEvent('close');const click=page.locator('#uninstall-app').click({noWaitAfter:true});await closed;await click.catch(error=>{if(!/closed/i.test(error.message))throw error;});application=null;
  const deadline=Date.now()+60000;let exists=true;while(Date.now()<deadline){try{await stat(executable);}catch{exists=false;break;}await new Promise(resolve=>setTimeout(resolve,250));}
  assert.equal(exists,false,'Detached uninstaller did not remove the installed EXE');
  console.log('PASS: settings button launched the real uninstaller after confirmation and closed Yoru');
}finally{if(application)await application.close();}
