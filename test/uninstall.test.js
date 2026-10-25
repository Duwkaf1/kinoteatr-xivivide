import test from 'node:test';import assert from 'node:assert/strict';import {uninstallHandler,uninstallAvailability} from '../desktop/uninstall.js';
test('cancelling full removal never launches a process or quits the application',async()=>{
 let launches=0,quits=0;const run=uninstallHandler({availability:async()=>({available:true,uninstaller:'C:\\Yoru\\Uninstall Yoru.exe'}),confirm:async()=>false,launch:()=>launches++,quit:()=>quits++});assert.equal((await run()).status,'cancelled');assert.equal(launches,0);assert.equal(quits,0);
});
test('confirmed removal uses fixed arguments and quits only after successful launch',async()=>{
 const events=[];const run=uninstallHandler({availability:async()=>({available:true,uninstaller:'C:\\Yoru\\Uninstall Yoru.exe'}),confirm:async()=>true,launch:async(file,args)=>events.push({file,args}),quit:()=>events.push('quit'),pid:1234});assert.equal((await run()).status,'started');assert.deepEqual(events,[{file:'C:\\Yoru\\Uninstall Yoru.exe',args:['/S','/PURGEUSERDATA','/WAITPID=1234']},'quit']);
});
test('a failed launch keeps the app running; duplicate requests do not launch two uninstallers',async()=>{
 let quitting=false;const run=uninstallHandler({availability:async()=>({available:true,uninstaller:'fixed'}),confirm:async()=>true,launch:async()=>{throw new Error('denied');},quit:()=>{quitting=true;}});assert.equal((await run()).status,'error');assert.equal(quitting,false);
 let release;const wait=new Promise(resolve=>{release=resolve;});const busy=uninstallHandler({availability:async()=>({available:true}),confirm:()=>wait,launch:async()=>{},quit:()=>{}});const first=busy();assert.equal((await busy()).status,'busy');release(false);assert.equal((await first).status,'cancelled');
});
test('development/portable or custom-profile runs cannot trigger destructive uninstall',async()=>{
 assert.equal((await uninstallAvailability({platform:'linux',packaged:true})).available,false);assert.equal((await uninstallAvailability({platform:'win32',packaged:false})).available,false);
 assert.equal((await uninstallAvailability({platform:'win32',packaged:true,userData:'C:\\Custom',appData:'C:\\Roaming',exe:'C:\\Yoru\\Yoru.exe'})).available,false);
 const run=uninstallHandler({availability:async()=>({available:false,reason:'portable'}),confirm:()=>{throw new Error('should not confirm');},quit:()=>{throw new Error('should not quit');}});assert.equal((await run()).status,'unavailable');
});
