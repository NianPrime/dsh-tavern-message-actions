// Host-owned operations: plugins receive closures, never raw file/storage access.
const tavernMessageActionStates = new Map();
const tavernMessageForkModes = new Map(), tavernMessageForkModeListeners = new Set();
function subscribeTavernMessageForkMode(listener){tavernMessageForkModeListeners.add(listener);return function(){tavernMessageForkModeListeners.delete(listener);};}
function useTavernMessageOperationContext(props) {
  const live = useScopedLiveTavernView(props.sessionId, String(props.turn), [["mode"],["latestAssistantTurn"],["latestAssistantMessageId"],["regeneratedDshTurns"],["forkTurnsByMessageId"],["historyWindow","revision"],["canEditBody"],["activity","busy"],["settleStatus"]]);
  const view = live.view;
  const turn = props.role === "user" ? tavernStoryTurnForDshTurn(view,props.turn) : props.turn;
  const latest = turn > 0 && Number(view && view.latestAssistantTurn) === turn;
  const [ownState,setState] = React.useState(null);
  const sharedState=React.useSyncExternalStore(subscribeTavernMessageForkMode,function(){return tavernMessageActionStates.get(props.sessionId);});
  const state=latest?ownState:sharedState;
  const [refresh,setRefresh] = React.useState(0);
  const forkLatestOnly = React.useSyncExternalStore(subscribeTavernMessageForkMode,function(){return tavernMessageForkModes.get(props.sessionId);});
  const askConfirm = useTavernConfirm(props.sessionId);
  React.useEffect(function () {
    let active = true, timer;
    setState(null);
    function check(){rpc("getMessageActionState",{},props.sessionId).then(function(result){if(!active)return;setState(result.state);tavernMessageActionStates.set(props.sessionId,result.state);tavernMessageForkModeListeners.forEach(function(listener){listener();});if(tavernMessageForkModes.get(props.sessionId)!==result.state.forkLatestOnly){tavernMessageForkModes.set(props.sessionId,result.state.forkLatestOnly);tavernMessageForkModeListeners.forEach(function(listener){listener();});}if(result.state.busy)timer=setTimeout(check,600);}).catch(function(){if(active)setState(null);});}
    if (latest) check();
    return function(){active=false;clearTimeout(timer);};
  },[props.sessionId,turn,latest,view && view.historyWindow && view.historyWindow.revision,view && view.canEditBody,view && view.activity && view.activity.busy,view && view.settleStatus,refresh]);
  const ready = state && ((state.canRetryRollback && turn===state.pendingKeptTurn)||(latest?state.turn===turn:turn>0&&turn<state.turn));
  const forkTurn = Number(view && view.forkTurnsByMessageId && (view.forkTurnsByMessageId[String(props.messageId||"")] || (latest && view.forkTurnsByMessageId[String(view.latestAssistantMessageId||"")]))) || 0;
  return {
    gameId:props.sessionId,turn:turn,settled:props.settled,role:props.role||"assistant",latest:Boolean(latest && (!state || state.turn===turn)),
    canEdit:Boolean(ready && state.canEdit && turn>1),canRetryRollback:Boolean(ready && state.canRetryRollback && turn===state.pendingKeptTurn),canRollback:Boolean(ready && ((state.canDelete && !latest)||(state.canRetryRollback && turn===state.pendingKeptTurn))),canDelete:Boolean(ready && state.canDelete),
    deleteReason:ready?state.deleteReason:"正在检查删除能力；不可用时请刷新页面重试",
    canFork:isPlayMode(view && view.mode),
    canForkNow:(forkLatestOnly===false && forkTurn>0) || (forkLatestOnly===true && latest && Boolean(ready && state.canEdit)),
    forkReason:forkLatestOnly===undefined?"正在检查分支能力":forkLatestOnly && !latest?"当前 SQLite 后端只支持从最新回合分支":forkLatestOnly && !(ready && state.canEdit)?"请等待当前处理完成":forkLatestOnly===false && forkTurn<1?"这条正文没有可用的原生分支边界":"从这条回复创建独立分支",
    copy:async function(){
      const text = props.role === "user" ? props.copyText : (await rpc("getMessageCopyText",{turn:turn},props.sessionId)).text;
      if (!await DshUi.writeClipboard(String(text||""))) throw new Error("复制失败，请检查剪贴板权限");
    },
    edit:async function(){
      const result = await rpc("getMessageBodyEdit",{turn:turn},props.sessionId);
      playControlsFeature.openMessageBodyEditor(props.sessionId,result.edit);
    },
    fork:async function(){
      if(forkLatestOnly!==true)return tavernConversationForkRequests.request({sessionId:props.sessionId,turn:forkTurn});
      const checked=(await rpc("getMessageActionState",{},props.sessionId)).state;
      if(!checked.canEdit || checked.turn!==turn)throw new Error("只能从静止的最新回合创建分支");
      return tavernConversationForkRequests.request({sessionId:props.sessionId,turn:turn,messageActionToken:checked.token});
    },
    rollbackTo:async function(){
      playControlsFeature.assertMessageRollbackSync();
      const checked=(await rpc("getMessageActionState",{},props.sessionId)).state;
      if(!(checked.canRetryRollback&&turn===checked.pendingKeptTurn)&&(!checked.canDelete||turn>=checked.turn))throw new Error(checked.deleteReason||"所选轮次没有后续可回退剧情");
      if(!await askConfirm("回退到第 "+turn+" 轮？\n\n保留这一轮，彻底删除后续所有输入、回复和相关存档历史，并清理撤销记录。此操作不能撤销。"))return;
      try{
        const result=await rpc("rollbackToMessageRound",{turn:turn,token:checked.token},props.sessionId);
        if(result.physicallyDeleted!==true)throw new Error("后端未确认物理回退");
        await playControlsFeature.messageRoundDeleted(props.sessionId,result.view);
        notifyTavernDataChanged(["sessions"],"message-actions");
      }finally{setRefresh(function(n){return n+1;});liveTavernView.invalidate(props.sessionId);tavernCoordination.invalidate(props.sessionId);}
    },
    remove:async function(){
      playControlsFeature.assertMessageRollbackSync();
      // Read before confirmation. The same token must survive the confirmation and server lock.
      const checked = (await rpc("getMessageActionState",{},props.sessionId)).state;
      if (!checked.canDelete || checked.turn!==turn) throw new Error(checked.deleteReason||"目标已变化，请刷新页面");
      if (!await askConfirm("彻底删除第 "+turn+" 轮？\n\n将删除这一轮的用户输入、回复和对应存档历史，并清除回退撤销记录。此操作不能撤销。\n其他独立分支和以前导出的备份不会删除。")) return;
      try {
        const result = await rpc("deleteLatestMessageRound",{turn:turn,token:checked.token},props.sessionId);
        if(result.physicallyDeleted!==true)throw new Error("后端未确认物理删除");
        await playControlsFeature.messageRoundDeleted(props.sessionId,result.view);
        notifyTavernDataChanged(["sessions"],"message-actions");
      } finally {
        setRefresh(function(n){return n+1;});
        liveTavernView.invalidate(props.sessionId);tavernCoordination.invalidate(props.sessionId);
      }
    }
  };
}
