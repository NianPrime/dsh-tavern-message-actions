import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {targets,optionalTargets,resources} from './transform.mjs'
const hash=value=>createHash('sha256').update(value).digest('hex');
const allowed=new Set([...targets,'tavern-plugin/lib/client.js',...resources.map(row=>row[0])]);
const installer=fileURLToPath(new URL('../install-bridge.mjs',import.meta.url));
export function createLayeredSeams(upstream){
  function manifest(appDir){
    const base=path.join(appDir,'.message-actions-preview-v1'),file=path.join(base,'manifest.json');
    if(!fs.existsSync(file))return null;
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    const v2=fs.readFileSync(path.join(base,'tavern-plugin/lib/index.js'),'utf8').includes('const pluginData = createPluginData(');
    const expected=new Set([...allowed,...(v2?optionalTargets:[])]);
    if(!v2&&!saved.files.some(e=>e.file==='tavern-plugin/lib/domain/plugin-mutation-gate.js'))expected.delete('tavern-plugin/lib/domain/plugin-mutation-gate.js');
    if(saved.root!==path.resolve(appDir)||saved.version!==1||saved.files.length!==expected.size||new Set(saved.files.map(e=>e.file)).size!==expected.size)throw Error('桥接层身份或清单不符');
    for(const entry of saved.files){
      if(!expected.has(entry.file))throw Error('桥接清单含未知路径');
      if(hash(fs.readFileSync(path.join(appDir,entry.file)))!==entry.installedHash)throw Error('桥接安装后文件已变化：'+entry.file);
      if(entry.existed&&hash(fs.readFileSync(path.join(base,entry.file)))!==entry.originalHash)throw Error('桥接基线备份已变化：'+entry.file);
    }
    return {base,saved};
  }
  return {
    checkStandardSeams(args){
      const overlay=manifest(args.appDir);
      if(!overlay){const state=upstream.checkStandardSeams(args);return {...state,ready:false,needsMessageBridge:true};}
      // Check the exact SQLite baseline in a source-only mirror. Neither its
      // recorded hashes nor the live source are rewritten to bypass verification.
      const mirrorParent=path.dirname(path.resolve(args.appDir));
      const mirror=path.join(mirrorParent,'.message-actions-verify-'+randomUUID());
      fs.mkdirSync(mirror);
      try{
        fs.cpSync(args.appDir,mirror,{recursive:true,filter:file=>{const rel=path.relative(args.appDir,file);return !rel.split(path.sep).some(part=>['node_modules','.message-actions-preview-v1','.git'].includes(part));}});
        for(const entry of overlay.saved.files){const file=path.join(mirror,entry.file);if(entry.existed)fs.copyFileSync(path.join(overlay.base,entry.file),file);else if(fs.existsSync(file))fs.unlinkSync(file);}
        return upstream.checkStandardSeams({...args,appDir:mirror});
      }finally{if(path.dirname(mirror)!==mirrorParent||!path.basename(mirror).startsWith('.message-actions-verify-'))throw Error('验证副本边界不符');fs.rmSync(mirror,{recursive:true,force:true});}
    },
    applyStandardSeams(args){
      if(manifest(args.appDir))throw Error('桥接已存在但上游校验未通过，拒绝重新覆盖');
      const result=upstream.applyStandardSeams(args);
      execFileSync(process.execPath,[installer,args.appDir,'--apply'],{stdio:'pipe',windowsHide:true});
      return {...result,changed:true};
    },
    uninstallStandardSeams(args){
      if(manifest(args.appDir))execFileSync(process.execPath,[installer,args.appDir,'--restore'],{stdio:'pipe',windowsHide:true});
      return upstream.uninstallStandardSeams(args);
    }
  };
}
