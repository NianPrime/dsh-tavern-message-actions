const marker = '// message-actions-bridge:v1'
function once(text,from,to) {
  if(text.split(from).length!==2)throw new Error('桥接锚点缺失或不唯一：'+from.slice(0,90));
  return text.replace(from,to);
}
export function transform(file,source) {
  let text=source.replace(/\r\n/g,'\n');
  if(text.includes(marker))throw new Error('该文件已含桥接补丁，请使用安装器核对版本：'+file);
  if(file==='tavern-plugin/lib/index.js') {
    if(text.includes('const pluginData = createPluginData(')) {
      text=once(text,"import { createPluginData } from './domain/plugin-data.js'","import { createPluginData } from './domain/plugin-data.js'\nimport { createPluginMutationGate } from './domain/plugin-mutation-gate.js'");
      text=once(text,'  const pluginData = createPluginData({ store: profileData })',"  const pluginMutationGate = createPluginMutationGate({ blocked: id => rollbackSchedulingBarrier.has(id) })\n  const pluginData = createPluginData({ store: profileData })");
      text=once(text,'  const pluginApi = createTavernPluginApi({','  const pluginApi = createTavernPluginApi({\n    mutationGate: pluginMutationGate,');
      text=once(text,"pluginApi.turnSettled(id).catch(error => console.warn('dsh-tavern: 插件轮次通知失败:'", "pluginApi.turnSettled(id, turn).catch(error => console.warn('dsh-tavern: 插件轮次通知失败:'");
      text=once(text,"notifyPluginTimeline(sessionId, 'edit', { settled: true })", "notifyPluginTimeline(sessionId, 'edit', { turn: args?.turn, settled: true })");
      if(text.includes("case 'getStorageMigration':"))text=once(text,"        return method === 'getStorageMigration' ? conversationMigration.status(chatId) : conversationMigration.start(chatId)",`        const storageVersion = String(await chatPersistence.version(chatId))
        if (storageVersion.startsWith('sqlite:')) {
          if (method === 'migrateStorage') throw new Error('当前已是 SQLite 存档，无需原生格式迁移')
          return { format: 'sqlite', phase: 'completed' }
        }
        if (storageVersion.startsWith('legacy:') && method === 'migrateStorage') throw new Error('原档只读，请使用 SQLite 分叉迁移')
        return method === 'getStorageMigration' ? conversationMigration.status(chatId) : conversationMigration.start(chatId)`);
      text=once(text,'      await worldbookRecallLog.pruneRollback(chat, turn, chat.timeline.branchId)',`      await worldbookRecallLog.pruneRollback(chat, turn, chat.timeline.branchId)
      await pluginData.pruneRollback(chat.id, turn)
      await pluginMedia.pruneRollback(chat.id, turn)`);
      text=once(text,'    quiesceRollback: async chat => {','    quiesceRollback: async chat => {\n      await pluginMutationGate.whenIdle(chat.sessionId)');
      text=once(text,'  async function deleteChat(chatId) {',`  async function deleteChat(chatId) {
    const target = await readChat(str(chatId))
    return pluginMutationGate.deleting(target?.sessionId || str(chatId), () => deleteChatWithPluginCleanup(chatId))
  }
  async function deleteChatWithPluginCleanup(chatId) {`);
      text=once(text,"    await pluginMedia.removeChat(chatId).catch(() => console.warn('dsh-tavern: 插件媒体记录清理失败', chatId))",'    await pluginMedia.removeChat(chatId)');
      text=once(text,"    await pluginData.removeChat(chatId).catch(() => console.warn('dsh-tavern: 插件数据清理失败', chatId))",'    await pluginData.removeChat(chatId)');
      text=once(text,'    const result = await conversationRegistry.remove(chatId)',`    // Retain the registry and its cleanup footprint until plugin deletion succeeds.
    await pluginMedia.removeChat(chatId)
    await pluginData.removeChat(chatId)
    const result = await conversationRegistry.remove(chatId)`);
      text=once(text,'    deletedChatIds.add(chatId)\n    await pluginMedia.removeChat(chatId)\n    await pluginData.removeChat(chatId)','    deletedChatIds.add(chatId)');
    }
    text=once(text,"import { createBodyEditor } from './domain/body-editor.js'","import { createBodyEditor } from './domain/body-editor.js'\nimport { createMessageOperations, readExportCompatibleChat } from './domain/message-operations.js'");
    if(text.includes('const dbSaveExchange = createDbSaveExchange('))text=once(text,'chatStore: chatJournalStore, chatForSession, readChat, dataRoot,','chatStore: chatJournalStore, chatForSession, readChat: id => readExportCompatibleChat(readChat,id), dataRoot,');
    text=once(text,'undoRollback: undoRollbackTurn } = createRoundHistory(','undoRollback: undoRollbackTurn, physicalRollback: messagePhysicalRollback } = createRoundHistory(');
    text=once(text,'  // ---------- HTTP RPC（客户端同源 fetch） ----------',`  const messageOperations = createMessageOperations({
    forSession: chatForSession, version: id => chatPersistence.version(id),
    persistence: () => ctx.get('sessionPersistence'), physicalRollback: messagePhysicalRollback,
    activity: chat => backgroundTasks.activity(chat),
    running: id => ctx.get('agents')?.get(id)?.phase?.kind === 'running',
    readEdit: (id,turn) => bodyEditor.read(id,turn), rollback: (id,chatId,turn,revision) => rollbackTurn(id,chatId,turn,revision,messagePhysicalRollback),
    rollbackHistory: (id,chatId,turn,revision) => rollbackTurn(id,chatId,turn,revision,true),
    exportSave: id => dbSaveExchange.exportGameSave(id), importSave: args => dbSaveExchange.importGameSave(args),
    ${text.includes('const pluginData = createPluginData(') ? `forkPlugins: async (source, result) => {
      const target = await chatForSession(result.sessionId)
      if (!target) throw new Error('数据库分支缺少目标存档')
      await forkPluginState(source, source, target, Number(source.messages.at(-1)?.turn || 1))
    },` : ''}
  })

  // ---------- HTTP RPC（客户端同源 fetch） ----------`);
    text=once(text,"      case 'getBodyEdit':",`      case 'getMessageActionState': return { state: await messageOperations.state(args?.sessionId) }
      case 'getMessageBodyEdit': return { edit: await messageOperations.readEdit(args?.sessionId,args?.turn) }
      case 'forkLatestMessageRound': return await messageOperations.fork(args?.sessionId,args)
      case 'deleteLatestMessageRound': return await messageOperations.remove(args?.sessionId,args)
      case 'rollbackToMessageRound': return await messageOperations.rollbackTo(args?.sessionId,args)
      case 'getMessageCopyText': {
        if (!Number.isSafeInteger(args?.turn) || args.turn < 1) throw new Error('无效轮次')
        const chat = await chatForSession(args.sessionId)
        const message = (chat?.messages || []).find(row => row.role === 'assistant' && Number(row.turn || (row.greeting ? 1 : 0)) === args.turn)
        if (!message) throw new Error('正文尚未就绪或已不存在')
        return {text:String(message.displayText ?? message.projectionText ?? message.text ?? '')}
      }
      case 'getBodyEdit':`);
  } else if(file==='tavern-plugin/lib/domain/body-editor.js') {
    text=once(text,'function latest(chat) {','function latest(chat, requestedTurn) {\n  if(requestedTurn!==undefined){\n    if(!Number.isSafeInteger(requestedTurn)||requestedTurn<1)throw new Error("正文轮次无效");\n    const selected=(chat.messages||[]).find(row=>row.role==="assistant"&&!row.greeting&&Number(row.turn)===requestedTurn);\n    if(!selected||!["story","script"].includes(chat.mode||"story"))throw new Error("目标正文不存在或不可编辑");\n    return selected;\n  }');
    text=once(text,'async function context(sessionId) {','async function context(sessionId, requestedTurn) {');
    text=once(text,'const message = latest(chat)','const message = latest(chat,requestedTurn)');
    text=once(text,'最后一轮正文已不在当前上下文中，无法编辑','这轮正文已不在可替换的模型上下文中，暂不能安全编辑');
    text=once(text,'async function read(sessionId) {','async function read(sessionId, requestedTurn) {');
    text=once(text,'await context(sessionId)\n    return','await context(sessionId,requestedTurn)\n    return');
    text=once(text,'await context(sessionId)\n      if','await context(sessionId,input?.turn)\n      if');
    text=once(text,'const patched = await saveLatestFloor(chat, message, patch, target, agent)','const historical=message!==chat.messages.at(-1)\n      const patched = historical ? undefined : await saveLatestFloor(chat, message, patch, target, agent)');
    text=once(text,'token(current, latest(current))','token(current, latest(current,input?.turn))');
    text=once(text,"kind: 'body.edit', turn: message.turn, patch } }).chat\n      },", "kind: historical ? 'body.history-edit' : 'body.edit', turn: message.turn, patch } }).chat\n      },");
  } else if(file==='tavern-plugin/lib/domain/story-timeline.js') {
    text=once(text,"    else if (intent.kind === 'body.edit') {",`    else if (intent.kind === 'body.history-edit') {
      const index=chat.messages.findIndex(row=>row?.role==='assistant'&&!row.greeting&&Number(row.turn)===Number(intent.turn))
      if(index<0)throw new Error('目标正文不存在，开场不可编辑')
      Object.assign(chat.messages[index],intent.patch)
      delete chat.messages[index].displayRuntime
      chat.timeline.revision++
      chat.timeline.updatedAt=now()
      // Later prose and settled business state remain. Discard derived prompt
      // summaries and rotate resident helpers so old prose is not reused.
      delete chat.contextCompaction
      chat.candidates=null;chat.candidateAgent=null
      for(const [role,participant] of Object.entries(chat.timeline.participants)) {
        chat.timeline.participants[role]={...participant,sessionId:'',boundary:null,rewindTo:null,status:'needs-session',syncedRevision:null,requiresNewSessionOnRewind:true,updatedAt:now()}
      }
      value={status:'edited',revision:chat.timeline.revision}
    }
    else if (intent.kind === 'body.edit') {`);
  } else if(file==='tavern-plugin/lib/domain/round-history.js') {
    const start=text.indexOf('  async function rollbackChat('),end=text.indexOf('\n  async function ',start+1);
    const body=text.slice(start,end<0?text.length:end);
    const physical=body.includes('// [dsh-tavern-clean-rollback:v1]')&&body.includes('storageRollback.cleanRollback')&&body.includes('return await cleanRollback(')&&!body.includes('replaceSessionSurface(');
    text=once(text,'async function rollbackTurn(sessionId, chatId, expectedTurn)', 'async function rollbackTurn(sessionId, chatId, expectedTurn, expectedRevision, historyTarget = false)');
    text=once(text,'      return await rollbackChat(chat, expectedTurn, restoredHandle?.agent)',`      if (expectedRevision !== undefined) {
        const current = await (chats.readState || readChat)(chat.id)
        if (!current || current._storageRevision !== expectedRevision || current.sessionId !== sessionId) throw new Error('会话或存档已变化，请重新确认删除')
      }
      return await rollbackChat(chat, expectedTurn, restoredHandle?.agent,historyTarget,expectedRevision)`);
    if(physical){
      text=once(text,'async function rollbackChat(chat, requestedTurn, restoredAgent) {','async function rollbackChat(chat, requestedTurn, restoredAgent, historyTarget, expectedRevision) {');
      text=once(text,'const cleanRollback = storageRollback.cleanRollback',`const useHistory = historyTarget || (await readChat(chat.id)).rollbackPending?.messageActionsHistory===1
      const cleanRollback = useHistory ? (await import('./history-clean-rollback.js')).cleanHistoryRollback : storageRollback.cleanRollback`);
      text=once(text,'return await cleanRollback({ chat, requestedTurn, availability: rollbackAvailability,','return await cleanRollback({ chat, requestedTurn, expectedRevision, availability: rollbackAvailability,');
      text=once(text,'readChat, updateChat, chats, sessions, view, readCard: readChatCard, quiesce:',`readChat, updateChat, chats, sessions, view:async(current,card)=>{
        if(useHistory){
          const {synchronizeBodyEdits}=await import('./body-editor.js')
          if(current.messages?.some(row=>row.bodyEdit)){
            const saved=await updateChat(current.id,chat=>{
              delete chat.contextCompaction;chat.candidates=null;chat.candidateAgent=null
              for(const [role,participant] of Object.entries(chat.timeline?.participants||{}))chat.timeline.participants[role]={...participant,sessionId:'',boundary:null,rewindTo:null,status:'needs-session',syncedRevision:null,requiresNewSessionOnRewind:true}
              return chat
            },{source:'rollback.body-edits'})
            Object.assign(current,saved)
          }
          const native=sessions.get(current.sessionId)?.session || sessions.getSession?.(current.sessionId)
          if(native)await synchronizeBodyEdits(native,current,sessions.flush)
        }
        return await view(current,card)
      }, readCard: readChatCard, quiesce:`);
    }
    text=once(text,'return Object.freeze({ regenerate, replayFailed: replayFailedTurn, recover: regenerationRecovery.recover, rollback: rollbackTurn, undoRollback })',`return Object.freeze({ regenerate, replayFailed: replayFailedTurn, recover: regenerationRecovery.recover, rollback: rollbackTurn, undoRollback, physicalRollback: ${physical} })`);
  } else if(file==='tavern-plugin/src/client/features/sidebar.js') {
    text=once(text,'async function forkConversation(item, currentTitle, turn) {','async function forkConversation(item, currentTitle, turn, messageActionToken) {');
    const from='const plan = await call("prepareConversationFork", { chatId: item.chatId, sessionId: item.sessionId, turn: Number(turn) || 0 });';
    const end='turn: plan.turn, sourceRevision: plan.sourceRevision, atSeq: plan.atSeq\n\t\t\t\t\t});';
    text=once(text,from,'if(messageActionToken){targetSessionId=(await call("forkLatestMessageRound",{sessionId:item.sessionId,turn:Number(turn),token:messageActionToken})).sessionId;}else{\n                    '+from);
    text=once(text,end,end+'\n                    }');
    text=once(text,'return forkConversation(item, title, request.turn);','return forkConversation(item, title, request.turn, request.messageActionToken);');
  } else if(file==='tavern-plugin/src/client/features/play-controls.js') {
    if(text.includes('function TavernStorageMigration(props) {'))text=once(text,'            if (!state && !error || state?.format === "native" && !started) return null;',`            if (state?.format === "sqlite") return React.createElement("section", {className:"dsh-tavern-status-section", "aria-label":"存档格式"}, React.createElement("div", {className:"dsh-tavern-status-label"}, "存档格式"), "SQLite 数据库存档")
            if (!state && !error || state?.format === "native" && !started) return null;`);
    text=once(text,'function createPlayControlsFeatureModule() {','function createPlayControlsFeatureModule() {\n            let messageActionSessions;');
    text=once(text,'function register(input) {','function register(input) {\n            messageActionSessions=input.ctx.sessions;');
    text=once(text,'{ token: panel.edit.token, texts: panel.texts }','{ token: panel.edit.token, turn:panel.edit.turn, texts: panel.texts }');
    text=once(text,'return Object.freeze({ register: register });',`return Object.freeze({ register: register,
            openMessageBodyEditor:function(sessionId,edit){
              setRegenPanel(null);setCandidatePanel(null);setCandidateGuidePanel(null);
              setBodyEditPanel({sessionId:sessionId,edit:edit,texts:edit.parts.filter(function(part){return part.kind==="text";}).map(function(part){return part.text;}),busy:false,error:""});
            },
            assertMessageRollbackSync:function(){if(typeof messageActionSessions?.waitForTavernRollbackSync!=="function")throw new Error("回退同步尚未接线，未执行删除");},
            messageRoundDeleted:async function(sessionId,view){
              await messageActionSessions.waitForTavernRollbackSync(view?.rolledBack?.sync);
              setBodyEditPanel(null);setCandidatePanel(null);setRegenPanel(null);setCandidateGuidePanel(null);
            }
          });`);
  } else if(file==='tavern-plugin/src/client/main.js') {
    text=once(text,'// @include features/plugin-extensions.js','// @include features/message-operations.js\n\t\t// @include features/plugin-extensions.js');
  } else if(file==='tavern-plugin/src/client/features/plugin-extensions.js') {
    const apiVersion=text.includes('apiVersion: 2,')?2:1;
    text=once(text,`apiVersion: ${apiVersion},`,`apiVersion: ${apiVersion},\n\t\t\t\tmessageOperationsVersion: 1,`);
    text=once(text,'return { id: String(input.id || input.label), label: input.label.trim(), when: input.when, run: input.run };',`if (input.disabled !== undefined && typeof input.disabled !== "function") throw new TypeError("disabled 必须是函数");
                if (input.title !== undefined && typeof input.title !== "function") throw new TypeError("title 必须是函数");
                if (input.roles !== undefined && (!Array.isArray(input.roles) || !input.roles.length || input.roles.some(function(role){return role!=="user"&&role!=="assistant";}))) throw new TypeError("roles 无效");
                return { id: String(input.id || input.label), label: input.label.trim(), when: input.when, run: input.run, disabled:input.disabled,title:input.title,roles:input.roles||["assistant"] };`);
    text=once(text,'const [busy, setBusy] = React.useState("");','const [busy, setBusy] = React.useState("");\n            const gate = React.useRef(false);');
    text=once(text,'if (!entry.when) return true;','if (context.role && entry.roles && !entry.roles.includes(context.role)) return false;\n                if (!entry.when) return true;');
    text=once(text,'const key = entry.owner + ":" + entry.id;',`const key = entry.owner + ":" + entry.id;
                    let disabled=false,title=entry.owner;
                    try {disabled=Boolean(entry.disabled&&entry.disabled(context));title=entry.title?String(entry.title(context)):entry.owner;}
                    catch(error){disabled=true;title="插件按钮状态读取失败";}`);
    text=once(text,'title: entry.owner, disabled: Boolean(busy) || props.disabled','title: title, disabled: Boolean(busy) || props.disabled || disabled');
    text=once(text,'\t\t\t\t\t\tsetBusy(key);','                        if(gate.current || disabled || props.disabled)return;\n                        gate.current=true;\n\t\t\t\t\t\tsetBusy(key);');
    text=once(text,'finally { setBusy(""); }','finally { gate.current=false;setBusy(""); }');
    text=once(text,'function TavernPluginMessageActions(props) {\n\t\t\tuseTavernUiExtensions();','function TavernPluginMessageActions(props) {\n            const context = useTavernMessageOperationContext(props);\n\t\t\tuseTavernUiExtensions();');
    text=once(text,'context: { gameId: props.sessionId, turn: props.turn, settled: props.settled }','context: context');
  } else if(file==='tavern-plugin/src/client/features/assistant-renderer.js') {
    text=once(text,'turn: storyTurn, settled: settled }) : null;','turn: storyTurn, settled: settled, role:"assistant", messageId:data.finalNode && data.finalNode.messageId }) : null;');
    text=once(text,'}, text), extras) : null),','}, text), extras) : null, React.createElement(TavernPluginMessageActions,{sessionId:props.sessionId,turn:turn,role:"user",settled:true,copyText:text})),');
  } else if(file==='tavern-plugin/lib/domain/plugin-data.js') {
    text=once(text,'  async function removeChat(chatId)',`  async function pruneRollback(chatId, turn) {
    if (!Number.isSafeInteger(turn) || turn < 1) throw new Error('插件数据回退边界无效')
    await update(chatId, value => {
      for (const own of Object.values(value.owners)) {
        own.turns = own.turns.filter(record => Number.isSafeInteger(record.turn) && record.turn < turn)
        // Unversioned game caches may contain deleted prose. Keep player settings only.
        own.game = null
      }
    })
  }
  async function removeChat(chatId)`);
    text=once(text,'removeChat, pathFor })','pruneRollback, removeChat, pathFor })');
  } else if(file==='tavern-plugin/lib/domain/plugin-media.js') {
    text=once(text,'  async function removeChat(chatId)',`  async function pruneRollback(chatId, turn) {
    if (!Number.isSafeInteger(turn) || turn < 1) throw new Error('插件媒体回退边界无效')
    await update(chatId, value => {
      value.items = value.items.filter(record => Number.isSafeInteger(record.turn) && record.turn < turn)
      for (const at of Object.keys(value.issued)) if (!Number.isSafeInteger(Number(at)) || Number(at) >= turn) delete value.issued[at]
    })
    for (const known of issuedKnown) {
      const parts = known.split('\\u0000')
      if (parts[0] === chatId && Number(parts[1]) >= turn) issuedKnown.delete(known)
    }
  }
  async function removeChat(chatId)`);
    text=once(text,'removeChat, pathFor })','pruneRollback, removeChat, pathFor })');
  } else if(file==='tavern-plugin/lib/domain/plugin-turns.js') {
    text=once(text,"['settleStatus', 'macroState', 'cardPath', 'cardName']", "['settleStatus', 'macroState', 'cardPath', 'cardName', 'rollbackPending', 'regenInProgress', 'regenRecovery']");
    text=once(text,"!['done', 'failed'].includes(header.settleStatus)", "!(['done', 'failed'].includes(header.settleStatus) || (header.settleStatus === 'idle' && !header.rollbackPending && !header.regenInProgress && !header.regenRecovery))");
  } else if(file==='tavern-plugin/lib/plugin-api.js') {
    text=once(text,'  async function setGamePlugin(gameId, { name, enabled, replace } = {}) {',`  function setGamePlugin(gameId, input) {
    return deps.mutationGate.run(gameIdOf(gameId), () => setGamePluginGuarded(gameId, input))
  }
  async function setGamePluginGuarded(gameId, { name, enabled, replace } = {}) {`);
    text=once(text,'  async function turnSettled(sessionId) {','  async function turnSettled(sessionId, requestedTurn) {');
    text=once(text,'    const material = await deps.readLatestSettledTurn(sessionId)', '    const material = requestedTurn === undefined ? await deps.readLatestSettledTurn(sessionId) : await deps.readTurn(sessionId, positiveTurn(requestedTurn))');
    text=once(text,'  Object.defineProperty(service, TRACKER,',`  // Mutations already in flight must finish before physical cleanup; late writes fail.
  if (!deps.mutationGate) throw new Error('插件写入缺少物理回退屏障')
  for (const name of ['saveTurnData', 'saveGameData', 'attach', 'update', 'remove', 'getTurn']) {
    const method = service[name]
    service[name] = function (...args) {
      const gameId = ['update', 'remove'].includes(name) ? pluginMediaSession(args[0]) : args[0]?.gameId
      return deps.mutationGate.run(gameIdOf(gameId), () => method.apply(this, args))
    }
  }
  Object.defineProperty(service, TRACKER,`);
  } else throw new Error('未知桥接目标：'+file);
  return marker+'\n'+text;
}
export const targets=['tavern-plugin/lib/index.js','tavern-plugin/lib/domain/round-history.js','tavern-plugin/lib/domain/body-editor.js','tavern-plugin/lib/domain/story-timeline.js','tavern-plugin/src/client/main.js','tavern-plugin/src/client/features/plugin-extensions.js','tavern-plugin/src/client/features/assistant-renderer.js','tavern-plugin/src/client/features/play-controls.js','tavern-plugin/src/client/features/sidebar.js'];
export const optionalTargets=['tavern-plugin/lib/domain/plugin-data.js','tavern-plugin/lib/domain/plugin-media.js','tavern-plugin/lib/domain/plugin-turns.js','tavern-plugin/lib/plugin-api.js'];
export const resources=[['tavern-plugin/lib/domain/message-operations.js','bridge/message-operations.js'],['tavern-plugin/src/client/features/message-operations.js','bridge/message-operations-client.js'],['tavern-plugin/lib/domain/history-clean-rollback.js','bridge/history-clean-rollback.js'],['tavern-plugin/lib/domain/history-rollback-cleanup.js','bridge/history-rollback-cleanup.js'],['tavern-plugin/lib/domain/plugin-mutation-gate.js','bridge/plugin-mutation-gate.js']];
