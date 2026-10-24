import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const titles = Array.from({ length: 500 }, (_, i) => ({ id: `title-${i}`, title: `История ${String(i).padStart(3,'0')}`, episodes: Array.from({length: 5}, (_, j) => ({id: String(j+1),number: j+1,sources:Array.from({length:3},(_,k)=>({id:String(k),url:`https://example.invalid/${i}/${j}/${k}.mp4`,language:'ru',voice:['AniDUB','AniLibria','Русская'][k],quality:1080}))}))}));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const measurements=[];
for(let run=0;run<5;run++){
 const context=await browser.newContext({viewport:{width:1400,height:1000}});
 await context.addInitScript(data=>localStorage.setItem('kadr.library.v1',JSON.stringify({titles:data,favorites:[],progress:{},quality:1080})),titles);
 const page=await context.newPage();
 const scripts=[];page.on('response',async r=>{if(r.request().resourceType()==='script')scripts.push(r.url())});
 await page.goto(process.env.KADR_BENCHMARK_URL || 'http://127.0.0.1:4173');
 await page.locator('.anime-card').first().waitFor();
 const startupMs=await page.evaluate(()=>performance.now());
 const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
 const heap=await page.evaluate(()=>performance.memory?.usedJSHeapSize);
 const dom=await cdp.send('Memory.getDOMCounters');
 const search=[];
 for(const value of ['История 49','История 4','История','История 1','История 12']){
  const started=performance.now();await page.locator('#search').fill(value);
  await page.waitForFunction(q=>[...document.querySelectorAll('.anime-card h3')].every(e=>e.textContent.toLowerCase().includes(q.toLowerCase()))&&document.querySelectorAll('.anime-card').length>0,value);
  search.push(performance.now()-started);
 }
 measurements.push({startupMs,heapBytes:heap,domNodes:dom.nodes,renderedCards:await page.locator('.anime-card').count(),searchMs:search,loadedScripts:scripts});
 await context.close();
}
await browser.close();
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
const result={scenario:'500 titles, 5 episodes/title, 3 sources/episode; production build, system Chromium Linux, 1400x1000; five fresh browser contexts',startupMedianMs:median(measurements.map(m=>m.startupMs)),heapMedianBytes:median(measurements.map(m=>m.heapBytes)),domNodesMedian:median(measurements.map(m=>m.domNodes)),searchMedianMs:median(measurements.flatMap(m=>m.searchMs)),measurements};
const output=path.resolve('artifacts/performance');
mkdirSync(output,{recursive:true});
writeFileSync(`${output}/${process.argv[2]||'run'}.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,measurements:undefined},null,2));
