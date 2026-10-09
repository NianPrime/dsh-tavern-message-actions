import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {transform} from '../bridge/transform.mjs'
import {createMessageOperations} from '../bridge/message-operations.js'
test('completed physical rollback permits retained prose replay before publishing synchronization',async()=>{
 let source=await fs.readFile(new URL('../bridge/history-clean-rollback.js',import.meta.url),'utf8')
 const barriers=new Set(),scheduling=new Set();globalThis.__historyRollbackTest={rollbackBarrier:barriers,rollbackSchedulingBarrier:scheduling}
 source=source.replace("import { storagePackage } from './storage-package.js'","const storagePackage=async key=>key==='rollback-barrier'?globalThis.__historyRollbackTest:{captureRollbackBusinessState:()=>({})}")
 source=source.replace("import {preflightRollback,preflightRollbackAtSeq,cleanupAfterRollbackAtSeq} from './history-rollback-cleanup.js'","const preflightRollback=()=>{},preflightRollbackAtSeq=()=>{},cleanupAfterRollbackAtSeq=async()=>{}")
 const {cleanHistoryRollback}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
 let chat={id:'c',sessionId:'s',messages:[{role:'assistant',turn:2}],rollbackPending:{version:1,id:'p',turn:3,cuts:[{sessionId:'s',boundarySeq:2,role:null}]}}
 const session={header:{id:'s'}},agent={session,phase:{kind:'idle'}}
 try{await cleanHistoryRollback({chat,readChat:async()=>chat,updateChat:async(_,fn)=>{chat=fn(chat)},chats:{rollbackArchivePath(){}},sessions:{get:()=>agent,flush:async()=>{}},persistence:{bindRollbackArchive(){},setRollbackPending:async()=>{}},services:{rollbackSyncProvider:()=>({assertReady(){},publish(){return {}}})},quiesce:async()=>{},sideCleanup:async()=>{},readCard:async()=>({}),view:async()=>{assert.equal(barriers.has('s'),false,'retained prose writes must occur after the physical barrier');assert.equal(scheduling.has('s'),true,'new turns remain blocked until sync');return {}}})}finally{delete globalThis.__historyRollbackTest}
})
const root=new URL('../../dsh-tavern-main/',import.meta.url)
test('history truncation exempts prose projections but still rejects real earlier-turn tails',async()=>{
 const domain=new URL('../../real-dsh-e2e/author/dsh-tavern-main/tavern-plugin/lib/domain/',import.meta.url)
 let source=await fs.readFile(new URL('../bridge/history-rollback-cleanup.js',import.meta.url),'utf8')
 source=source.replace(/from '(\.\/[^']+)'/g,(_,ref)=>"from '"+new URL(ref,domain).href+"'")
 const oldHome=process.env.DSH_HOME;process.env.DSH_HOME=fileURLToPath(new URL('../../real-dsh-e2e/home/',import.meta.url))
 let cleanup;try{cleanup=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))}finally{if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome}
 const log=[{type:'system/message',data:{}},{type:'turn/start',data:{turn:2}},{type:'assistant/message',data:{turn:2}},{type:'turn/end',data:{turn:2}},{type:'turn/start',data:{turn:3}},{type:'turn/end',data:{turn:3}},{type:'assistant/message',data:{turn:2,message:{id:'tavern-body-edit:test',source:{model:'body-edit'}}}}].map((e,seq)=>({...e,seq}))
 const session={header:{id:'test'},log,surfaceManager:{},snapshotEvents:()=>log}
 assert.equal(cleanup.preflightRollback(session,3,{strict:false}).ok,true)
 log.at(-1).data.message.id='actual-model-reply'
 assert.equal(cleanup.preflightRollback(session,3,{strict:false}).ok,false)
})
async function transformed(file){
 const source=await fs.readFile(new URL('.message-actions-preview-v1/'+file,root),'utf8').catch(()=>fs.readFile(new URL(file,root),'utf8'))
 const result=transform(file,source).replace(/from '(\.\/[^']+)'/g,(_,ref)=>"from '"+new URL(ref,new URL(file,file.endsWith('/body-editor.js')?new URL('../../real-dsh-e2e/author/dsh-tavern-main/',import.meta.url):root)).href+"'")
 return import('data:text/javascript;base64,'+Buffer.from(result).toString('base64'))
}
test('unpatched real Session refuses history replacement before publishing durable prose',async()=>{
 const {Session}=await import('file:///F:/DSH-Tavern/runtime-8775c4dd2dcb7fb1-setup6-9e54ee9cfecc4054b3cfdb27d49e0bb3/resources/app/node_modules/@deepseek-ai/dsh-session/lib/index.js')
 const {createBodyEditor}=await transformed('tavern-plugin/lib/domain/body-editor.js')
 const {createStoryTimeline}=await transformed('tavern-plugin/lib/domain/story-timeline.js')
 const session=Session.create('history-editor-test')
 for(const turn of [2,3]){
  session.append('turn/start',{turn})
  session.append('user/message',{id:'u'+turn,role:'user',content:[{type:'text',text:'input'+turn}],source:{kind:'user'}},{surfaceOp:'append'})
  session.append('assistant/message',{turn,step:1,message:{id:'a'+turn,role:'assistant',content:[{type:'text',text:'body'+turn}],source:{kind:'model',provider:'fixture',model:'fixture'}},stream:[]},{surfaceOp:'append'})
  session.append('turn/end',{turn,reason:{kind:'completed'}})
 }
 let chat={id:'c',sessionId:session.id,mode:'story',variables:{hp:9},posture:'settled',ledger:{gold:4},settleStatus:'done',messages:[{role:'assistant',turn:1,greeting:true,text:'opening'},{role:'user',text:'input2'},{role:'assistant',turn:2,text:'body2'},{role:'user',text:'input3'},{role:'assistant',turn:3,text:'body3'}]}
 const editor=createBodyEditor({chats:{forSession:async()=>structuredClone(chat),update:async(_,fn)=>{chat=fn(structuredClone(chat));return structuredClone(chat)}},sessions:{get:()=>({session,phase:{kind:'idle'}}),flush:async()=>{}},timeline:createStoryTimeline(),activity:()=>({busy:false}),project:async text=>({sessionText:text,displayText:text}),present:value=>value})
 const edit=await editor.read(session.id,2)
 assert.equal(edit.parts[0].text,'body2')
 await assert.rejects(editor.save(session.id,{turn:3,token:edit.token,texts:['wrong-target']}),/变化/)
 await assert.rejects(editor.save(session.id,{turn:2,token:edit.token,texts:['edited history']}),/sourceEventSeqs/)
 assert.equal(chat.messages[2].text,'body2');assert.equal(chat.messages[4].text,'body3');assert.equal(chat.variables.hp,9)
 const visible=JSON.stringify(session.deriveMessages());assert.ok(visible.includes('body2'));assert.ok(!visible.includes('edited history'))
})
test('historical prose edit preserves later prose and settled variables',async()=>{
 const {createStoryTimeline}=await transformed('tavern-plugin/lib/domain/story-timeline.js')
 const timeline=createStoryTimeline()
 const chat={id:'c',mode:'story',messages:[{role:'assistant',turn:1,greeting:true,text:'open'},{role:'user',text:'u2'},{role:'assistant',turn:2,text:'old'},{role:'user',text:'u3'},{role:'assistant',turn:3,text:'later'}],variables:{hp:8},posture:'current posture',ledger:{gold:2},settleStatus:'done'}
 const saved=timeline.apply({chat,intent:{kind:'body.history-edit',turn:2,patch:{text:'edited'}}}).chat
 assert.equal(saved.messages[2].text,'edited');assert.equal(saved.messages[4].text,'later')
 assert.deepEqual(saved.variables,chat.variables);assert.deepEqual(saved.ledger,chat.ledger);assert.equal(saved.posture,chat.posture)
 assert.throws(()=>timeline.apply({chat,intent:{kind:'body.history-edit',turn:1,patch:{text:'bad'}}}),/正文|开场/)
})
test('rollback-to keeps selected turn and requests first later real turn with exact revision',async()=>{
 let chat={id:'c',sessionId:'s',_storageRevision:7,mode:'story',settleStatus:'done',messages:[{role:'assistant',turn:1,greeting:true},{role:'user',text:'u2'},{role:'assistant',turn:2,text:'keep'},{role:'user',text:'u5'},{role:'assistant',turn:5,text:'delete'},{role:'user',text:'u8'},{role:'assistant',turn:8,text:'delete2'}]};const calls=[]
 const api=createMessageOperations({forSession:async()=>structuredClone(chat),version:async()=> 'sqlite:gen:7',physicalRollback:true,persistence:()=>({truncateEvents(){}}),activity:()=>({busy:false}),rollbackHistory:async(...args)=>{calls.push(args);chat.messages=chat.messages.slice(0,3);return {rolledBack:{hiddenTurn:5}}},readEdit:async(_,turn)=>({turn,parts:[]})})
 const state=await api.state('s')
 assert.equal((await api.readEdit('s',2)).turn,2)
 await assert.rejects(api.rollbackTo('s',{turn:2,token:'stale'}),/变化/)
 const result=await api.rollbackTo('s',{turn:2,token:state.token})
 assert.deepEqual(calls,[['s','c',5,7,true]])
 assert.equal(result.keptTurn,2);assert.equal(chat.messages.at(-1).turn,2)
 await assert.rejects(api.rollbackTo('s',{turn:2,token:state.token}),/后续|变化/)
})
test('rollback-to opening accepts legacy greeting without an explicit turn field',async()=>{
 let chat={id:'c',sessionId:'s',_storageRevision:1,messages:[{role:'assistant',greeting:true,text:'opening'},{role:'user',text:'input'},{role:'assistant',turn:2,text:'body'}]}
 const api=createMessageOperations({forSession:async()=>structuredClone(chat),version:async()=> 'sqlite:gen:1',physicalRollback:true,persistence:()=>({truncateEvents(){}}),activity:()=>({busy:false}),rollbackHistory:async()=>{chat.messages=chat.messages.slice(0,1);return {}}})
 const result=await api.rollbackTo('s',{turn:1,token:(await api.state('s')).token})
 assert.equal(result.keptTurn,1);assert.equal(chat.messages.length,1)
})

test('prepared history rollback exposes only its selected-turn recovery action',async()=>{
 let chat={id:'c',sessionId:'s',_storageRevision:8,mode:'story',settleStatus:'done',messages:[{role:'assistant',turn:1,greeting:true},{role:'assistant',turn:2,text:'kept'}],rollbackPending:{version:1,id:'pending',messageActionsHistory:1,keptTurn:2,turn:3,cuts:[]}}
 const calls=[]
 const api=createMessageOperations({forSession:async()=>structuredClone(chat),version:async()=> 'sqlite:gen:8',physicalRollback:true,persistence:()=>({truncateEvents(){}}),activity:()=>({busy:false}),rollbackHistory:async(...args)=>{calls.push(args);delete chat.rollbackPending;return {}}})
 const state=await api.state('s')
 assert.equal(state.canDelete,false);assert.equal(state.canEdit,false);assert.equal(state.canRetryRollback,true);assert.equal(state.pendingKeptTurn,2)
 await assert.rejects(api.rollbackTo('s',{turn:1,token:state.token}),/恢复|目标/)
 await api.rollbackTo('s',{turn:2,token:state.token})
 assert.deepEqual(calls,[['s','c',3,8,true]])
})

test('native recovery routes persisted history intent through history cleanup and prose replay',async()=>{
 const file='tavern-plugin/lib/domain/round-history.js'
 const source=await fs.readFile(new URL('.message-actions-preview-v1/'+file,root),'utf8')
 const {applyRollbackTransform}=await import('../../sqlite-v2-reference/dsh-tavern-sqlite-v2-main/deploy/core-rollback-transform.mjs')
 const installed=transform(file,applyRollbackTransform(source.replace(/\r\n/g,'\n')).text)
 assert.match(installed,/messageActionsHistory===1/)
 assert.match(installed,/const cleanRollback = useHistory/)
 assert.match(installed,/if\(useHistory\)/)
 const cleaner=await fs.readFile(new URL('../bridge/history-clean-rollback.js',import.meta.url),'utf8')
 assert.match(cleaner,/pending=\{version:1,id:randomUUID\(\),turn,cuts,messageActionsHistory:1,keptTurn:/)
})

test('interrupted physical cleanup preserves intent and converges on a fresh-process retry',async()=>{
 let source=await fs.readFile(new URL('../bridge/history-clean-rollback.js',import.meta.url),'utf8')
 const env={rollbackBarrier:new Set(),rollbackSchedulingBarrier:new Set(),fail:true,cleanup:0};globalThis.__historyRetryTest=env
 source=source.replace("import { storagePackage } from './storage-package.js'","const storagePackage=async key=>key==='rollback-barrier'?globalThis.__historyRetryTest:{captureRollbackBusinessState:()=>({})}")
 source=source.replace("import {preflightRollback,preflightRollbackAtSeq,cleanupAfterRollbackAtSeq} from './history-rollback-cleanup.js'","const preflightRollback=()=>{},preflightRollbackAtSeq=()=>{},cleanupAfterRollbackAtSeq=async()=>{globalThis.__historyRetryTest.cleanup++;if(globalThis.__historyRetryTest.fail)throw new Error('injected truncate failure')}")
 const {cleanHistoryRollback}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
 let durable={id:'c',sessionId:'s',messages:[{role:'assistant',turn:2,text:'edited'}],rollbackPending:{version:1,id:'p',turn:3,messageActionsHistory:1,keptTurn:2,cuts:[{sessionId:'s',boundarySeq:2,role:null}]}}
 const session={header:{id:'s'}},agent={session,phase:{kind:'idle'}};let replayed=false
 const options=()=>({chat:structuredClone(durable),readChat:async()=>structuredClone(durable),updateChat:async(_,fn)=>{durable=fn(structuredClone(durable))},chats:{rollbackArchivePath(){}},sessions:{get:()=>agent,flush:async()=>{}},persistence:{bindRollbackArchive(){},setRollbackPending:async()=>{}},services:{rollbackSyncProvider:()=>({assertReady(){},publish(){return {}}})},quiesce:async()=>{},sideCleanup:async()=>{},readCard:async()=>({}),view:async chat=>{replayed=true;assert.equal(chat.messages[0].text,'edited');return {}}})
 try{
  await assert.rejects(cleanHistoryRollback(options()),/injected truncate failure/)
  assert.equal(durable.rollbackPending.messageActionsHistory,1);assert.equal(replayed,false);assert.equal(env.rollbackBarrier.has('s'),true)
  env.rollbackBarrier.clear();env.rollbackSchedulingBarrier.clear();env.fail=false
  await cleanHistoryRollback(options())
  assert.equal(durable.rollbackPending,undefined);assert.equal(replayed,true);assert.equal(env.cleanup,2);assert.equal(env.rollbackBarrier.size,0)
 }finally{delete globalThis.__historyRetryTest}
})
