# 新版适配检查 · 0.2.1-preview.1 · 2026-10-09

目标上游 5026df7f61dfdbe463a0a58ca0edc8edffc6b2c6；配套 SQLite V2 0.3.5-preview.1。

本轮命令：插件目录 node --test --test-isolation=none tests/*.test.mjs，36 项通过；SQLite 目录 node --test --test-isolation=none test/rollback-head-prune.test.mjs test/clean-rollback-refusal.test.mjs test/db-save-codec.test.mjs test/db-save-exchange.test.mjs test/rollback-handles.test.mjs test/background-rollback.test.mjs test/fork-history-markers.test.mjs，41 项通过。

新增覆盖：v2 所有旧正文版本的插件数据和媒体清理、整局缓存失效而用户设置保留、媒体凭据及内存缓存清理、写入排空、删除失败注册记录保留、原生迁移拦截、idle 轮次读取、后台撤销使用真实 Agent、新宿主通知及 lastNativeTurn 保留。部分上游后端旧测试依赖其原作者本机 tmp/tools 夹具，本机缺失，不能计为通过；本轮采用上列可运行定向测试和新版真实 DSH 验收。

真实隔离运行证据位于工作区 upstream-e2e/evidence-v2.json 与 evidence-edit.json。生产服务未更新。下方为此前版本记录，不能替代本轮结果。

---
# 检查记录 · 0.2.0-preview.1 · 2026-10-09

插件 28 项、SQLite V2 相关测试 20 项，合计 48 项通过；独立代码复核通过。

插件命令（工作区验收夹具，不是脱离宿主的独立测试套件）：

```powershell
node --test --test-isolation=none tests/bridge.test.mjs tests/message-operations.test.mjs tests/history-actions.test.mjs tests/layered-seams.test.mjs tests/sqlite-tail-export.test.mjs
```

覆盖历史正文选轮、保留后续正文和已结算变量、非连续轮号回退、无显式 turn 的开场、旧编辑令牌拒绝、版本与并发屏障、保留正文的原生投影重放、真实 SQLite 删除及导出、分层补丁和安装器。新增恢复测试覆盖清理失败保留完成意图、模拟新进程重试收敛，以及只允许恢复持久记录的保留轮次。原生恢复入口的消费者选择以生成源码检查验证，未做真实进程强杀故障注入。

SQLite V2 0.3.4 命令：

```powershell
node --test --test-isolation=none test/rollback-head-prune.test.mjs test/clean-rollback-refusal.test.mjs test/db-save-codec.test.mjs test/db-save-exchange.test.mjs test/rollback-handles.test.mjs
```

覆盖撤销及索引清理、失败写入屏障、活动句柄回卷、导出导入及并发拒绝。这是相关路径验证，不是整个后端的全面认证。

完整客户端通过原项目 build-tavern-client.mjs --check。实际开发副本和隔离运行副本均经 restore→apply 更新为 14 文件桥接；安装器校验源码与备份 SHA-256。SQLite 上游清单未改动，组合宿主在还原桥接基线的临时镜像上检查。

真实 DSH 隔离 Profile 已完成历史编辑、多轮回退、同连接页面同步、数据库、重启、导出导入和继续生成验收，详见 E2E-REPORT.md。生成使用本地确定性回复，外部模型连通性不计为通过。原运行实例、用户真实存档和原始 ZIP 未修改。

发行工件检查：从 0.2.0-preview.1 tgz 解出安装器，在补齐宿主源码、客户端资源及原生成文件的独立夹具上完成预检、14 文件 apply、已安装哈希核对和 restore。夹具缺失资源时安装器拒绝，补齐后通过。包内无运行时依赖目录、测试 Profile、日志或凭据。
