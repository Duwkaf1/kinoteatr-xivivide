import path from 'node:path';
import { access, realpath, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
export async function uninstallAvailability({platform=process.platform,packaged,exe,appData,userData}) {
  if(platform!=='win32'||!packaged)return {available:false,reason:'Полное удаление доступно в установленной Windows-версии Yoru.'};
  if(path.win32.normalize(userData).toLowerCase()!==path.win32.join(appData,'kadr-anime').toLowerCase())return {available:false,reason:'Для удаления запусти Yoru обычным способом, без отдельной папки профиля.'};
  const uninstaller=path.win32.join(path.win32.dirname(exe),'Uninstall Yoru.exe');
  try{await access(uninstaller);const marker=JSON.parse(await readFile(path.win32.join(path.win32.dirname(exe),'yoru-install.json'),'utf8'));if(marker.fullUninstall!==true)throw new Error('Old installer');const [actual,folder]=await Promise.all([realpath(uninstaller),realpath(path.win32.dirname(exe))]);if(path.win32.dirname(actual).toLowerCase()!==folder.toLowerCase())throw new Error('Unexpected location');return {available:true,uninstaller};}
  catch{return {available:false,reason:'Это версия без установщика. Закрой Yoru и удали распакованную папку; данные находятся в профиле приложения.'};}
}
export function uninstallHandler({availability,confirm,launch=(file,args)=>new Promise((resolve,reject)=>{const child=spawn(file,args,{detached:true,stdio:'ignore',windowsHide:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});}),quit,pid=process.pid}) {
  let busy=false;
  return async()=>{
    if(busy)return {status:'busy'};
    busy=true;
    try{const plan=await availability();if(!plan.available)return {status:'unavailable',message:plan.reason};
      if(!await confirm())return {status:'cancelled'};
      await launch(plan.uninstaller,['/S','/PURGEUSERDATA',`/WAITPID=${pid}`]);
      quit();return {status:'started'};
    }catch{return {status:'error',message:'Не удалось запустить удаление. Yoru остаётся установленным. Попробуй ещё раз или удали его через настройки Windows.'};}
    finally{busy=false;}
  };
}
