import test from 'node:test'
import assert from 'node:assert/strict'

const module = await import('../bridge/message-operations.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  return {}
})

test('export compatibility accepts idle read copies without changing active or recovery barriers',async()=>{
 const idle={id:'c',settleStatus:'idle',messages:[]};
 const adapted=await module.readExportCompatibleChat(async()=>idle,'c');
 assert.equal(adapted.settleStatus,undefined);assert.equal(idle.settleStatus,'idle');assert.notEqual(adapted,idle);
 for(const chat of [{settleStatus:'running'},{settleStatus:'pending'},{settleStatus:'idle',rollbackPending:{}},{settleStatus:'idle',regenInProgress:true},{settleStatus:'idle',regenRecovery:{}}])assert.equal(await module.readExportCompatibleChat(async()=>chat,'c'),chat);
});

function fixture(overrides = {}) {
  assert.equal(typeof module.createMessageOperations, 'function', 'message operation adapter must exist')
  let chat = {id:'chat-test',sessionId:'session-test',_storageRevision:7,mode:'story',settleStatus:'done',
    messages:[{role:'assistant',turn:1,greeting:true,text:'opening'},{role:'user',turn:2,text:'input'},{role:'assistant',turn:2,text:'reply'}]}
  const calls = []
  const deps = {
    physicalRollback:true,
    forSession:async id => id === chat.sessionId ? structuredClone(chat) : undefined,
    version:async () => 'sqlite:gen:7',
    persistence:() => ({truncateEvents(){}}),
    activity:() => ({busy:false}),
    readEdit:async () => ({turn:2,token:'body-token',parts:[{kind:'text',text:'reply'}]}),
    rollback:async (...args) => {
      calls.push(args)
      chat.messages.splice(1)
      chat._storageRevision++
      return {rolledBack:{hiddenTurn:2}}
    },
    ...overrides
  }
  return {api:module.createMessageOperations(deps),calls,setChat:patch => Object.assign(chat,patch),chat:() => structuredClone(chat)}
}

test('physical deletion requires both patched consumer and SQLite backend',async () => {
  for (const overrides of [{physicalRollback:false},{version:async () => 'native:abc'},{persistence:() => ({})}]) {
    const f=fixture(overrides)
    const state=await f.api.state('session-test')
    assert.equal(state.canDelete,false)
    assert.match(state.deleteReason,/SQLite|物理/)
    await assert.rejects(f.api.remove('session-test',{turn:2,token:state.token}),/SQLite|物理/)
    assert.equal(f.calls.length,0)
  }
})

test('SQLite branches clone an immutable full save and reject stale source snapshots',async()=>{
 let imported=0,exported=0;
 const f=fixture({exportSave:async()=>{exported++;return {base64:'complete-database-closure'};},importSave:async args=>{imported++;assert.equal(args.fileB64,'complete-database-closure');return {sessionId:'new-main',chatId:'new-chat'};}});
 const state=await f.api.state('session-test');
 await assert.rejects(f.api.fork('session-test',{turn:1,token:state.token}),/目标/);
 await assert.rejects(f.api.fork('session-test',{turn:2,token:'stale'}),/变化/);
 assert.deepEqual(await f.api.fork('session-test',{turn:2,token:state.token}),{sessionId:'new-main',chatId:'new-chat'});
 assert.equal(exported,1);assert.equal(imported,1);assert.equal(f.chat().messages.length,3);
 const changed=fixture({exportSave:async()=>{changed.setChat({_storageRevision:8});return {base64:'old'};},importSave:async()=>{throw Error('must not import changed source');}});
 const token=(await changed.api.state('session-test')).token;
 await assert.rejects(changed.api.fork('session-test',{turn:2,token}),/源存档已变化/);
});

test('latest-round removal carries exact revision and cannot remove another round',async () => {
  const f=fixture(),state=await f.api.state('session-test')
  assert.equal(state.canDelete,true)
  await assert.rejects(f.api.remove('session-test',{turn:1,token:state.token}),/最后|最新|目标/)
  const result=await f.api.remove('session-test',{turn:2,token:state.token})
  assert.deepEqual(f.calls,[['session-test','chat-test',2,7]])
  assert.equal(result.physicallyDeleted,true)
  await assert.rejects(f.api.remove('session-test',{turn:2,token:state.token}),/最后|最新|变化|目标/)
  assert.equal(f.calls.length,1)
})

test('stale body/revision and missing token are rejected before deletion',async () => {
  const f=fixture(),state=await f.api.state('session-test')
  f.setChat({_storageRevision:8})
  await assert.rejects(f.api.remove('session-test',{turn:2,token:state.token}),/变化/)
  const fresh=await f.api.state('session-test')
  f.setChat({messages:[{role:'user',turn:2,text:'input'},{role:'assistant',turn:2,text:'changed'}]})
  await assert.rejects(f.api.remove('session-test',{turn:2,token:fresh.token}),/变化/)
  await assert.rejects(f.api.remove('session-test',{turn:2}),/变化|token/)
  assert.equal(f.calls.length,0)
})

test('busy work and concurrent duplicate operations are rejected',async () => {
  const busy=fixture({activity:() => ({busy:true})}),state=await busy.api.state('session-test')
  assert.equal(state.canDelete,false)
  await assert.rejects(busy.api.remove('session-test',{turn:2,token:state.token}),/等待|处理/)
  let finish
  const f=fixture({rollback:() => new Promise(resolve => {finish=resolve})}),ready=await f.api.state('session-test')
  const first=f.api.remove('session-test',{turn:2,token:ready.token})
  // Wait until the first request reaches the backend, rather than guess a duration.
  for(let i=0;i<20&&!finish;i++) await Promise.resolve()
  assert.equal(typeof finish,'function')
  await assert.rejects(f.api.remove('session-test',{turn:2,token:ready.token}),/正在/)
  finish({})
  await assert.rejects(first,/仍|核对|未完成/)
})

test('warnings, pending recovery and surviving undo are never reported as success',async () => {
  for(const remainder of [{rollbackUndo:{ready:true}},{rollbackPending:{id:'pending'}}]) {
    let f
    f=fixture({rollback:async () => {f.setChat({...remainder,messages:[{role:'assistant',turn:1,greeting:true}]});return {}}})
    const state=await f.api.state('session-test')
    await assert.rejects(f.api.remove('session-test',{turn:2,token:state.token}),/仍|核对|未完成/)
  }
  const f=fixture({rollback:async () => ({rollbackWarning:'save failed'})}),state=await f.api.state('session-test')
  await assert.rejects(f.api.remove('session-test',{turn:2,token:state.token}),/save failed/)
})

test('historical edit never opens latest body and original read-only saves refuse editing',async () => {
  let reads=0
  const f=fixture({readEdit:async () => {reads++;return {turn:2,parts:[]}}})
  await assert.rejects(f.api.readEdit('session-test',1),/最后|最新|目标/)
  assert.equal(reads,0)
  assert.equal((await f.api.readEdit('session-test',2)).turn,2)
  const original=fixture({version:async () => 'legacy:123:456'})
  await assert.rejects(original.api.readEdit('session-test',2),/只读/)
})

test('missing session, unsafe turn and unsupported play mode refuse operations',async () => {
  const f=fixture()
  await assert.rejects(f.api.state('other'),/不存在/)
  await assert.rejects(f.api.readEdit('session-test',2.1),/轮次|目标/)
  f.setChat({mode:'character'})
  assert.equal((await f.api.state('session-test')).canDelete,false)
})
