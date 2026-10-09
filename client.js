window.__ModuleLoader__.load({
  id: 'dsh-tavern-message-actions',
  factory: function () {
    return {
      inject: ['tavernUi'],
      apply: function (ctx) {
        const ui = ctx.tavernUi;
        if (!ui || ui.messageOperationsVersion !== 1) throw new Error('请先安装消息操作桥接补丁，再启用插件');
        ui.registerMessageAction({id:'rp-copy',label:'复制',roles:['user','assistant'],run:function(c){return c.copy();}});
        ui.registerMessageAction({id:'rp-edit',label:'编辑',roles:['assistant'],when:function(c){return c.turn>1;},disabled:function(c){return !c.canEdit;},title:function(c){return c.canEdit?'编辑这轮正文，保留后续剧情，不重跑变量结算':'请等待当前处理完成';},run:function(c){return c.edit();}});
        ui.registerMessageAction({id:'rp-fork',label:'分支',roles:['assistant'],when:function(c){return c.canFork;},disabled:function(c){return !c.canForkNow;},title:function(c){return c.forkReason;},run:function(c){return c.fork();}});
        ui.registerMessageAction({id:'rp-rollback',label:'回退到此轮',roles:['assistant'],when:function(c){return !c.latest||c.canRetryRollback;},disabled:function(c){return !c.canRollback;},title:function(c){return c.canRollback?'保留此轮，彻底删除后续轮次及相关历史':c.deleteReason;},run:function(c){return c.rollbackTo();}});
        ui.registerMessageAction({id:'rp-delete',label:'删除本轮',roles:['user','assistant'],when:function(c){return c.latest;},disabled:function(c){return !c.canDelete;},title:function(c){return c.deleteReason||'不可撤销：删除本轮输入、回复和对应存档历史';},run:function(c){return c.remove();}});
      }
    };
  }
});
