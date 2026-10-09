import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyBackgroundTaskRollbackTransform} from '../../sqlite-v2-adapted/deploy/background-rollback-transform.mjs';
import {applyHostTransform} from '../../sqlite-v2-adapted/deploy/core-host-transform.mjs';
import {applyForkHistoryTransform} from '../../sqlite-v2-adapted/deploy/fork-history-transform.mjs';
import {transform} from '../bridge/transform.mjs';
const record=JSON.parse(fs.readFileSync(new URL('../../upstream-5026df7f/dsh-tavern-5026df7f61dfdbe463a0a58ca0edc8edffc6b2c6/.tavern-standard-seams.json',import.meta.url)));
const original=file=>Buffer.from(record.before['tavern-plugin/lib/'+file],'base64').toString();
test('upstream v2 host edit notification and native fork turn boundary survive SQLite transforms',()=>{
 const host=applyHostTransform(original('index.js'));
 assert.equal(applyHostTransform(host),host);
 assert.ok(host.includes("notifyPluginTimeline(sessionId, 'edit', { settled: true })"));
 const fork=fs.readFileSync(new URL('../../upstream-5026df7f/dsh-tavern-5026df7f61dfdbe463a0a58ca0edc8edffc6b2c6/.message-actions-preview-v1/tavern-plugin/lib/index.js',import.meta.url),'utf8');
 assert.equal(applyForkHistoryTransform(fork),fork);
 assert.ok(fork.includes('now: Date.now, lastNativeTurn })'));
});
const baseHost=()=>fs.readFileSync(new URL('../../upstream-5026df7f/dsh-tavern-5026df7f61dfdbe463a0a58ca0edc8edffc6b2c6/.message-actions-preview-v1/tavern-plugin/lib/index.js',import.meta.url),'utf8');
test('new native migration cannot rewrite SQLite or read-only original saves',async()=>{
 const host=transform('tavern-plugin/lib/index.js',baseHost());
 const start=host.indexOf("      case 'getStorageMigration':"),end=host.indexOf("      case 'getCardOrganization':",start);
 let stamp='sqlite:gen:3',nativeStarts=0;
 const context={readSessionMap:async()=>({s:'c'}),str:String,chatPersistence:{version:async()=>stamp},conversationMigration:{start:()=>{nativeStarts++},status:()=>({format:'legacy'})}};
 const run=vm.runInNewContext('(async function(method,args){switch(method){'+host.slice(start,end)+'}})',context);
 assert.equal((await run('getStorageMigration',{sessionId:'s'})).format,'sqlite');
 await assert.rejects(run('migrateStorage',{sessionId:'s'}),/无需原生格式迁移/);
 stamp='legacy:old';await assert.rejects(run('migrateStorage',{sessionId:'s'}),/原档只读/);assert.equal(nativeStarts,0);
});
test('plugin cleanup failure keeps the conversation registry available for deletion retry',async()=>{
 const host=transform('tavern-plugin/lib/index.js',baseHost());
 const start=host.indexOf('  async function deleteChatWithPluginCleanup('),end=host.indexOf('  async function exportConversation(',start);
 let removed=0,fail=true;
 const run=vm.runInNewContext('(function(){'+host.slice(start,end)+';return deleteChatWithPluginCleanup})()',{
  stopChatForDeletion:async()=>{},readChat:async()=>({id:'c',sessionId:'s'}),str:String,
  gameFootprint:{describe:async()=>null},conversationRegistry:{remove:async()=>{removed++;return {deleted:true}}},deletedChatIds:new Set(),
  pluginMedia:{removeChat:async()=>{if(fail)throw Error('disk failure')}},pluginData:{removeChat:async()=>{}},pluginApi:{gameRemoved:()=>{}}
 });
 await assert.rejects(run('c'),/disk failure/);assert.equal(removed,0);fail=false;await run('c');assert.equal(removed,1);
});
test('upstream background undo passes the real Agent and awaits physical truncation',async()=>{
 const source=applyBackgroundTaskRollbackTransform(original('background-agent-task.js'));
 assert.equal(applyBackgroundTaskRollbackTransform(source),source);
 const start=source.indexOf('  async function undoLastTask('),end=source.indexOf('\n  async function execute(',start);
 assert.ok(start>0&&end>start);
 assert.ok(source.includes('return undoLastTask(agent, traceSessionId)'));
 const undo=vm.runInNewContext('(function(options,sessionEvents){'+source.slice(start,end)+';return undoLastTask})');
 let release,finished=false,actual;const agent={session:{seq:30,surface:{nodes:[11]}},phase:{kind:'idle',lastTurn:2}};
 const run=undo({rewindSession:async(subject,boundary)=>{actual=subject;assert.equal(boundary,10);await new Promise(r=>release=r)}},()=>[{type:'user/message',seq:11,data:{id:'task'}}]);
 const result=run(agent,'trace').then(v=>{finished=true;return v});
 await Promise.resolve();assert.equal(actual,agent);assert.equal(finished,false);release();assert.equal((await result).undone,true);
});
