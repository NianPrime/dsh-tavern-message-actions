import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {transform} from '../bridge/transform.mjs';
const root=new URL('../../upstream-5026df7f/dsh-tavern-5026df7f61dfdbe463a0a58ca0edc8edffc6b2c6/',import.meta.url);
async function load(file){const original=await fs.readFile(new URL('.message-actions-preview-v1/'+file,root),'utf8').catch(()=>fs.readFile(new URL(file,root),'utf8'));const source=transform(file,original);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
async function loadRelative(file){const original=await fs.readFile(new URL('.message-actions-preview-v1/'+file,root),'utf8').catch(()=>fs.readFile(new URL(file,root),'utf8'));const source=transform(file,original).replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>"from '"+new URL(p,new URL(file,root)).href+"'");return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
function store(){const files=new Map();return {files,readJson:async p=>structuredClone(files.get(p)),updateJson:async(p,fn)=>{files.set(p,fn(structuredClone(files.get(p))));},remove:async p=>files.delete(p)};}
test('v2 physical cut removes every later plugin version, preserves game settings and independent fork',async()=>{
 const {createPluginData}=await load('tavern-plugin/lib/domain/plugin-data.js');const s=store(),data=createPluginData({store:s});
 for(const chatId of ['source','fork'])for(const [turn,key] of [[2,'keep'],[3,'old'],[3,'new'],[5,'later']])await data.saveTurn({chatId,owner:'p',turn,key,data:{secret:key}});
 await data.saveGame({chatId:'source',owner:'p',data:{setting:true}});
 await data.updateSettings('source',s=>s.disabled.push('disabled-plugin'));
 await data.pruneRollback('source',3);
 assert.deepEqual((await data.turnsUpTo({chatId:'source',owner:'p',turn:99})).map(x=>x.key),['keep']);
 assert.equal((await data.turnsUpTo({chatId:'fork',owner:'p',turn:99})).length,4);
 assert.equal(await data.readGame({chatId:'source',owner:'p'}),null);
 assert.deepEqual((await data.readSettings('source')).disabled,['disabled-plugin']);
 await data.pruneRollback('source',3);await data.removeChat('source');assert.equal(s.files.has(data.pathFor('source')),false);
});
test('v2 physical cut prunes media records and issued capabilities including cache',async()=>{
 const {createPluginMedia}=await load('tavern-plugin/lib/domain/plugin-media.js');const s=store(),media=createPluginMedia({store:s,id:()=>Math.random().toString()});
 for(const turn of [2,3,5]){await media.issue('source',turn,'old'+turn);await media.attach({chatId:'source',sessionId:'s',owner:'p',turn,key:'old'+turn,currentKey:'old'+turn,item:{kind:'image',status:'pending'}});}
 await media.pruneRollback('source',3);
 assert.deepEqual((await media.list({chatId:'source'})).map(x=>x.turn),[2]);
 const raw=await s.readJson(media.pathFor('source'));assert.deepEqual(Object.keys(raw.issued),['2']);
 await assert.rejects(media.attach({chatId:'source',sessionId:'s',owner:'p',turn:3,key:'old3',currentKey:'new3',item:{kind:'image',status:'pending'}}),/textVersion/);
 await media.issue('source',3,'old3');assert.ok((await s.readJson(media.pathFor('source'))).issued[3]);
});


test('mutation fence drains started writes and rejects late writes during rollback or deletion',async()=>{
 const {createPluginMutationGate}=await import('../bridge/plugin-mutation-gate.js');let blocked=false,release,committed=false,cleaned=false;
 const gate=createPluginMutationGate({blocked:()=>blocked});
 const started=gate.run('s',async()=>{await new Promise(r=>release=r);committed=true;});await Promise.resolve();blocked=true;
 const drain=gate.whenIdle('s').then(()=>cleaned=true);await Promise.resolve();assert.equal(cleaned,false);
 await assert.rejects(gate.run('s',()=>assert.fail('late write')),/物理清理/);
 release();await started;await drain;assert.equal(committed,true);blocked=false;
 await gate.deleting('s',async()=>{await assert.rejects(gate.run('s',()=>{}),/物理清理/);});
 await gate.run('s',()=>{});
});

test('v2 plugin reader accepts quiescent SQLite idle head and refuses recovery or pending settlement',async()=>{
 const {createPluginTurnReader}=await loadRelative('tavern-plugin/lib/domain/plugin-turns.js');
 let header={settleStatus:'idle'};
 const chat={id:'chat',sessionId:'session',mode:'story',messages:[{role:'assistant',turn:2,text:'kept prose'}]};
 const reader=createPluginTurnReader({sessionState:async()=>chat,sceneState:async()=>chat,header:async()=>header});
 assert.equal((await reader.readLatestSettledTurn('session')).text,'kept prose');
 for(const blocked of [{rollbackPending:{}},{regenInProgress:true},{regenRecovery:{}},{settleStatus:'running'}]){header={settleStatus:'idle',...blocked};assert.equal(await reader.readLatestSettledTurn('session'),null);}
 header={settleStatus:'done'};chat.messages[0].mvu={pending:true};assert.equal(await reader.readLatestSettledTurn('session'),null);
});
