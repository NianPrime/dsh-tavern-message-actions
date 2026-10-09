import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import {transform,targets} from '../bridge/transform.mjs'
const root=new URL('../../dsh-tavern-main/',import.meta.url)
const original=new Map(await Promise.all(targets.map(async file=>[file,await readFile(new URL('.message-actions-preview-v1/'+file,root),'utf8').catch(()=>readFile(new URL(file,root),'utf8'))])));
test('known archive bridges completely; unknown or duplicate anchors refuse',()=>{
  for(const [file,source] of original){
    const changed=transform(file,source);
    assert.match(changed,/message-actions-bridge:v1/);
    assert.throws(()=>transform(file,''),/锚点/);
    assert.throws(()=>transform(file,source+'\n'+source),/锚点/);
    assert.throws(()=>transform(file,changed),/已含/);
  }
  assert.match(transform('tavern-plugin/lib/domain/round-history.js',original.get('tavern-plugin/lib/domain/round-history.js')),/physicalRollback: false/);
});
test('SQLite transformed physical consumer enables deletion; marker alone cannot',async()=>{
  const {applyRollbackTransform}=await import('../../sqlite-v2-reference/dsh-tavern-sqlite-v2-main/deploy/core-rollback-transform.mjs');
  const file='tavern-plugin/lib/domain/round-history.js',source=original.get(file);
  const physical=applyRollbackTransform(source.replace(/\r\n/g,'\n')).text;
  assert.match(transform(file,physical),/physicalRollback: true/);
  assert.match(transform(file,source.replace('async function rollbackChat(chat, requestedTurn, restoredAgent) {','async function rollbackChat(chat, requestedTurn, restoredAgent) {\n// [dsh-tavern-clean-rollback:v1]')),/physicalRollback: false/);
});
test('browser registrations preserve old assistant default and enforce single-flight',()=>{
  const file='tavern-plugin/src/client/features/plugin-extensions.js';
  const source=transform(file,original.get(file)).replace(/^\s*\/\/ @include-domain.*$/gm,'');
  let ref={current:false},updates=[],actions=[],errors=[];
  const sandbox={React:{useState:()=>['',v=>updates.push(v)],useRef:()=>ref,useSyncExternalStore:()=>{},createElement:(type,props,...children)=>({type,props,children})},tavernErrorHub:{report:(...a)=>errors.push(a)}};
  vm.createContext(sandbox);new vm.Script(source+'\nglobalThis.hub=tavernUiExtensions;globalThis.Buttons=TavernPluginActionButtons;').runInContext(sandbox);
  const ui=sandbox.hub.service;
  ui.registerMessageAction({label:'old',run(){}});
  assert.deepEqual(Array.from(sandbox.hub.messageActions()[0].roles),['assistant']);
  ui.registerMessageAction({label:'new',roles:['user','assistant'],disabled:()=>true,run(){throw Error('must not run');}});
  assert.throws(()=>ui.registerMessageAction({label:'bad',roles:['anything'],run(){}}));
  let finish,count=0;
  const tree=sandbox.Buttons({context:{role:'assistant'},actions:[{owner:'test',id:'x',label:'x',run:()=>{count++;return new Promise(r=>finish=r);}}]});
  const click=tree.children[0][0].props.onClick,first=click();click();
  assert.equal(count,1);finish();return first.then(()=>assert.equal(ref.current,false));
});
test('standalone plugin refuses missing bridge and registers expected operations',async()=>{
  let registration;
  vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:v=>registration=v}}});
  const plugin=registration.factory();
  assert.throws(()=>plugin.apply({tavernUi:{}}),/桥接/);
  const actions=[];plugin.apply({tavernUi:{messageOperationsVersion:1,registerMessageAction:a=>actions.push(a)}});
  assert.deepEqual(actions.map(a=>a.label),['复制','编辑','分支','回退到此轮','删除本轮']);
  assert.equal(actions.find(a=>a.id==='rp-delete').disabled({canDelete:false}),true);
});
test('browser confirmation keeps the old token and refreshes after failed deletion',async()=>{
  const source=await readFile(new URL('../bridge/message-operations-client.js',import.meta.url),'utf8');
  let calls=[],confirmations=[],invalidations=0,clears=0;
  const state={turn:2,canDelete:true,token:'before-confirmation'};
  const sandbox={playControlsFeature:{assertMessageRollbackSync:()=>{}},React:{useSyncExternalStore:()=>undefined,useState:()=>[null,()=>{}],useEffect:()=>{}},useScopedLiveTavernView:()=>({view:{mode:'story',latestAssistantTurn:2,forkTurnsByMessageId:{a2:2}}}),useTavernConfirm:()=>async message=>{confirmations.push(message);state.token='changed-while-confirming';return true;},isPlayMode:v=>v==='story',rpc:async(method,args,id)=>{calls.push({method,args,id});if(method==='getMessageActionState')return {state:{...state}};throw Error('stale token rejected');},liveTavernView:{invalidate:()=>invalidations++},tavernCoordination:{invalidate:()=>invalidations++},historyProjection:{rolledBack:()=>clears++}};
  vm.createContext(sandbox);vm.runInContext(source+'\nglobalThis.context=useTavernMessageOperationContext({sessionId:"s",turn:2,role:"assistant",messageId:"a2",settled:true});',sandbox);
  await assert.rejects(sandbox.context.remove(),/stale/);
  assert.equal(calls[1].args.token,'before-confirmation');assert.equal(calls[1].id,'s');
  assert.match(confirmations[0],/不能撤销/);assert.equal(invalidations,2);assert.equal(clears,0);
});
test('revision is checked again after resuming the session, before entering rollback',async()=>{
  const file='tavern-plugin/lib/domain/round-history.js';
  const source=transform(file,original.get(file));
  const start=source.indexOf('  async function rollbackTurn('),end=source.indexOf('\n  async function rollbackChat(',start);
  let deleted=0,disposed=0,revision=7;
  const sandbox={sessionPatch:null,str:v=>String(v||''),chats:{readState:async()=>({id:'c',sessionId:'s',_storageRevision:revision})},pendingReplays:new Set(),pendingRegenerations:new Set(),pendingRollbacks:new Set(),sessions:{get:()=>null,getSession:()=>null,resume:async()=>{revision++;return {dispose:()=>disposed++};}},rollbackChat:()=>deleted++};
  vm.createContext(sandbox);vm.runInContext(source.slice(start,end)+'\nglobalThis.remove=rollbackTurn',sandbox);
  await assert.rejects(sandbox.remove('s','c',2,7),/已变化/);
  assert.equal(deleted,0);assert.equal(disposed,1);assert.equal(sandbox.pendingRollbacks.size,0);
});

test('busy operation state is refreshed until the actual session becomes idle',async()=>{
  const source=await readFile(new URL('../bridge/message-operations-client.js',import.meta.url),'utf8');
  let effect,cleanup,timer,updates=[],requests=0,cleared=false;
  const sandbox={React:{useSyncExternalStore:()=>undefined,useState:()=>[null,v=>updates.push(v)],useEffect:fn=>effect=fn},useScopedLiveTavernView:()=>({view:{mode:'story',latestAssistantTurn:2}}),useTavernConfirm:()=>{},isPlayMode:()=>true,rpc:async()=>({state:{turn:2,busy:++requests===1,canEdit:requests>1,canDelete:requests>1}}),setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>cleared=true};
  vm.createContext(sandbox);vm.runInContext(source+'\nuseTavernMessageOperationContext({sessionId:"s",turn:2,role:"assistant"});',sandbox);
  cleanup=effect();await Promise.resolve();assert.equal(updates.at(-1).busy,true);assert.equal(typeof timer,'function');
  timer();await Promise.resolve();assert.equal(updates.at(-1).canDelete,true);assert.equal(requests,2);
  cleanup();assert.equal(cleared,true);
});

test('message callbacks use the host panel owner and await rollback push synchronization',async()=>{
  const source=await readFile(new URL('../bridge/message-operations-client.js',import.meta.url),'utf8');
  let calls=[],release;
  const sandbox={React:{useSyncExternalStore:()=>true,useState:()=>[null,()=>{}],useEffect:()=>{}},useScopedLiveTavernView:()=>({view:{mode:'story',latestAssistantTurn:2,forkTurnsByMessageId:{a2:2}}}),useTavernConfirm:()=>async()=>true,isPlayMode:()=>true,
    playControlsFeature:{assertMessageRollbackSync:()=>calls.push('ready'),openMessageBodyEditor:(id,edit)=>calls.push(['edit',id,edit]),messageRoundDeleted:()=>{calls.push('sync-start');return new Promise(r=>release=r);}},
    rpc:async(method)=>method==='getMessageBodyEdit'?{edit:{turn:2,parts:[]}}:method==='getMessageActionState'?{state:{turn:2,canDelete:true,token:'ok'}}:{physicallyDeleted:true,view:{}},
    notifyTavernDataChanged:()=>calls.push('notified'),liveTavernView:{invalidate(){}},tavernCoordination:{invalidate(){}}};
  vm.createContext(sandbox);vm.runInContext(source+'\nglobalThis.context=useTavernMessageOperationContext({sessionId:"s",turn:2,role:"assistant",messageId:"a2"});',sandbox);
  await sandbox.context.edit();assert.deepEqual(calls[0],['edit','s',{turn:2,parts:[]}]);
  const removing=sandbox.context.remove();await new Promise(setImmediate);
  assert.ok(calls.includes('sync-start'));assert.ok(!calls.includes('notified'));release();await removing;assert.ok(calls.includes('notified'));
  vm.runInContext('globalThis.historical=useTavernMessageOperationContext({sessionId:"s",turn:1,role:"assistant",messageId:"a2"});',sandbox);
  assert.equal(sandbox.historical.canForkNow,false);assert.match(sandbox.historical.forkReason,/最新回合/);
});
