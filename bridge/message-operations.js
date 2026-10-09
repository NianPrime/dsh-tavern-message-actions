import { createHash } from 'node:crypto'

// SQLite V2 restores a quiescent head as `idle`; its exporter accepts absent,
// done or failed status. Normalize the read copy, keeping the source and every
// pending/running/recovery barrier unchanged. The exporter still validates all
// owned sessions, revisions and database snapshot stability itself.
export async function readExportCompatibleChat(read, id) {
  const chat = await read(id)
  return chat?.settleStatus === 'idle' && !chat.rollbackPending && !chat.regenInProgress && !chat.regenRecovery
    ? {...chat, settleStatus: undefined} : chat
}

// The UI never edits files or substitutes logical rollback for physical deletion.
export function createMessageOperations(deps) {
  const pending = new Set()

  async function inspect(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('会话不存在')
    const chat = await deps.forSession(sessionId)
    if (!chat || chat.sessionId !== sessionId) throw new Error('会话不存在或绑定已变化')
    const messages = chat.messages || []
    const last = messages.at(-1)
    const turn = last?.role === 'assistant' && !last.greeting ? Number(last.turn) : 0
    const playable = ['story', 'script'].includes(chat.mode || 'story')
    const stamp = String(await deps.version(chat.id))
    const readonly = stamp.startsWith('legacy:')
    const busy = chat.regenInProgress === true || ['pending','running'].includes(chat.settleStatus)
      || deps.activity(chat)?.busy === true || deps.running?.(sessionId) === true
    const physical = deps.physicalRollback === true && /^sqlite:gen:\d+(?::empty)?$/.test(stamp)
      && typeof deps.persistence()?.truncateEvents === 'function'
    const revision = chat._storageRevision
    const token = createHash('sha256').update(JSON.stringify([
      chat.id, sessionId, revision, chat.timeline?.branchId, chat.timeline?.revision,
      messages.length, messages.at(-2), last
    ])).digest('hex')
    const intent=chat.rollbackPending
    const pendingKeptTurn=intent?.messageActionsHistory===1 && intent.version===1 ? intent.keptTurn : null
    const canRetryRollback=playable && !busy && !readonly && physical && Number.isSafeInteger(revision) && Number.isSafeInteger(pendingKeptTurn) && pendingKeptTurn>0 && Number.isSafeInteger(intent?.turn) && intent.turn>pendingKeptTurn && Number(last?.turn || (last?.greeting?1:0))===pendingKeptTurn
    const canEdit = playable && turn > 0 && !busy && !readonly && !chat.rollbackPending
    const reason = !playable ? '只有游玩会话支持删除轮次'
      : readonly ? '原档只读，请先分叉为 SQLite 数据库存档'
      : !physical ? '需要完整安装并适配 SQLite V2 物理回退后端'
      : chat.rollbackPending ? '物理回退尚未完成，请先恢复处理'
      : busy ? '请等待当前生成或后台处理完成'
      : !Number.isSafeInteger(turn) || turn < 1 || !Number.isSafeInteger(revision) ? '没有可删除的最新完整轮次'
      : ''
    return {chat, state:{version:1,turn,token,canEdit,canRetryRollback,pendingKeptTurn,canDelete:reason === '',deleteReason:reason,readonly,busy,forkLatestOnly:stamp.startsWith('sqlite:')}}
  }

  function assertTarget(state, turn) {
    if (!Number.isSafeInteger(turn) || turn < 1 || turn !== state.turn) throw new Error('目标已变化，只能操作最后一轮正文')
  }

  return Object.freeze({
    async state(sessionId) { return (await inspect(sessionId)).state },
    async readEdit(sessionId, turn) {
      const {chat,state} = await inspect(sessionId)
      if(!Number.isSafeInteger(turn)||turn<1||!chat.messages?.some(row=>row.role==='assistant'&&!row.greeting&&Number(row.turn)===turn))throw new Error('目标正文已变化或不存在')
      if (!state.canEdit) throw new Error(state.readonly ? '原档只读，不能编辑' : '请等待当前处理完成后再编辑')
      const edit = await deps.readEdit(sessionId,turn)
      if (edit.turn !== turn) throw new Error('正文目标已变化，请重新打开编辑')
      return edit
    },
    async rollbackTo(sessionId,input){
      if(pending.has(sessionId))throw new Error('正在处理本局操作，请等待完成')
      pending.add(sessionId)
      try{
        const {chat,state}=await inspect(sessionId)
        const retry=state.canRetryRollback && input?.turn===state.pendingKeptTurn
        if(!state.canDelete&&!retry)throw new Error(state.canRetryRollback?'恢复目标已变化，请在保留轮次继续回退':state.deleteReason)
        if(typeof input?.token!=='string'||input.token!==state.token)throw new Error('正文或会话已变化，请重新确认回退')
        const turn=input?.turn, index=chat.messages.findIndex(row=>row.role==='assistant'&&Number(row.turn || (row.greeting?1:0))===turn)
        if(!Number.isSafeInteger(turn)||index<0)throw new Error('保留的目标轮次不存在')
        const next=chat.messages.slice(index+1).find(row=>row.role==='assistant'&&!row.greeting)
        if(!next&&!retry)throw new Error('所选轮次没有后续可回退剧情')
        const removedFromTurn=retry?chat.rollbackPending.turn:Number(next.turn)
        if(typeof deps.rollbackHistory!=='function')throw new Error('缺少历史物理回退接线')
        const view=await deps.rollbackHistory(sessionId,chat.id,removedFromTurn,chat._storageRevision,true)
        if(view?.rollbackWarning)throw new Error('物理回退未完成：'+view.rollbackWarning)
        const after=await deps.forSession(sessionId)
        if(!after||after.id!==chat.id||after.sessionId!==sessionId||after.rollbackPending||after.rollbackUndo||Number(after.messages?.at(-1)?.turn || (after.messages?.at(-1)?.greeting?1:0))!==turn||after.messages.some(row=>Number(row.turn)>=removedFromTurn))throw new Error('历史回退后置核对未完成，请检查后端')
        return {view,physicallyDeleted:true,keptTurn:turn,removedFromTurn}
      }finally{pending.delete(sessionId)}
    },
    async fork(sessionId, input) {
      if (pending.has(sessionId)) throw new Error('正在处理本局操作，请等待完成')
      pending.add(sessionId)
      try {
        const {chat,state} = await inspect(sessionId)
        assertTarget(state,input?.turn)
        if (!state.canEdit || !state.forkLatestOnly) throw new Error('当前存档尚不能创建 SQLite 独立分支')
        if (typeof input?.token !== 'string' || input.token !== state.token) throw new Error('正文或会话已变化，请重新创建分支')
        const save = await deps.exportSave(sessionId)
        if ((await inspect(sessionId)).state.token !== state.token) throw new Error('导出期间源存档已变化，请重新创建分支')
        const result = await deps.importSave({fileB64:save.base64})
        if (deps.forkPlugins) await deps.forkPlugins(chat,result)
        return result
      } finally {pending.delete(sessionId)}
    },
    async remove(sessionId, input) {
      if (pending.has(sessionId)) throw new Error('正在删除本轮，请等待完成')
      pending.add(sessionId)
      try {
        const {chat,state} = await inspect(sessionId)
        assertTarget(state,input?.turn)
        if (!state.canDelete) throw new Error(state.deleteReason)
        if (typeof input?.token !== 'string' || input.token !== state.token) throw new Error('正文或会话已变化，请重新确认删除')
        const view = await deps.rollback(sessionId,chat.id,state.turn,chat._storageRevision)
        if (view?.rollbackWarning) throw new Error('物理删除未完成：'+view.rollbackWarning)
        const after = await deps.forSession(sessionId)
        if (!after || after.id !== chat.id || after.sessionId !== sessionId || after.rollbackUndo || after.rollbackPending
          || (after.messages || []).some(row => Number(row?.turn) >= state.turn)) {
          throw new Error('物理删除后置核对未完成，仍有轮次或恢复记录；请先检查后端')
        }
        return {view,physicallyDeleted:true,removedTurn:state.turn}
      } finally { pending.delete(sessionId) }
    }
  })
}
