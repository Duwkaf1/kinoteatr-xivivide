import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {customPalette,contrast,applyCustom} from '../src/custom-theme.js';
import {themeBootstrap} from '../scripts/build-theme-init.js';
const colors=['#0044f0','#323334','#121212','#ffffff','#000000','#777777','#ff00ff','#eeeeee'];
test('custom text and controls remain readable for the reported blue palette and opposing surfaces',()=>{
 for(const background of colors)for(const panel of colors){const p=customPalette({background,panel,text:'#121212',accent:'#b97322'});assert.ok(contrast(p.text,p.background)>=4.5);assert.ok(contrast(p.panelText,p.panel)>=4.5);assert.ok(contrast(p.controlText,p.soft)>=4.5);assert.ok(contrast(p.accent,p.background)>=4.5);assert.ok(contrast(p.panelAccent,p.panel)>=4.5);}
});
test('first-paint bootstrap and the live editor compute the same safe palette',()=>{
 const source=readFileSync(new URL('../src/custom-theme.js',import.meta.url),'utf8');const bootstrap=themeBootstrap(source);
 for(const background of colors){const input={background,panel:'#323334',text:'#121212',accent:'#b97322',radius:28};const live=new Map();const early=new Map();const root=map=>({dataset:{},style:{setProperty:(k,v)=>map.set(k,v)}});
  applyCustom(root(live),input);const document={documentElement:root(early)};
  vm.runInNewContext(bootstrap,{document,localStorage:{getItem:()=>JSON.stringify({theme:'custom',custom:input})}});assert.deepEqual([...early],[...live]);assert.equal(document.documentElement.dataset.theme,'custom');
 }
});

test('comfort mode softens saturated surfaces while preserving an explicit opt-out',()=>{
 const raw={background:'#0044f0',panel:'#323334',text:'#121212',accent:'#b97322'};
 assert.notEqual(customPalette(raw).background,raw.background);assert.equal(customPalette({...raw,comfort:false}).background,raw.background);
 assert.equal(customPalette({...raw,background:'#141b28'}).background,'#141b28');
});
