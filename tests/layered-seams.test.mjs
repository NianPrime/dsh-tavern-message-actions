import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createLayeredSeams} from '../bridge/layered-seams.mjs'
const appDir=fileURLToPath(new URL('../../real-dsh-e2e/author/dsh-tavern-main',import.meta.url));
const upstream=await import('../../real-dsh-e2e/sqlite-v2/deploy/standard-seams.mjs');
test('layered boot validates SQLite baseline and exact installed bridge without changing upstream records',()=>{
 const record=path.join(appDir,'.tavern-standard-seams.json');
 const before=fs.readFileSync(record);
 assert.throws(()=>upstream.checkStandardSeams({appDir}),/漂移|不兼容/);
 const result=createLayeredSeams(upstream).checkStandardSeams({appDir});
 assert.equal(result.ready,true);assert.deepEqual(fs.readFileSync(record),before);
 const target=path.join(appDir,'tavern-plugin/lib/domain/message-operations.js'),body=fs.readFileSync(target);
 try{fs.appendFileSync(target,'\n// drift');assert.throws(()=>createLayeredSeams(upstream).checkStandardSeams({appDir}),/已变化/);}finally{fs.writeFileSync(target,body);}
});
