# 来源和修改说明

本包按 AGPL-3.0-only 提供源代码，许可证全文见 LICENSE。

bridge/history-clean-rollback.js 改编自 dsh-tavern-sqlite-v2 0.3.4 的 lib/clean-rollback.js。
bridge/history-rollback-cleanup.js 改编自该项目的 lib/rollback-cleanup.js。
来源：https://github.com/huajiao1998/dsh-tavern-sqlite-v2
保留上游原有注释和许可证。修改日期：2026-10-09。

改动：以显式历史轮次选择删除段；增加回退修订校验；将纯正文替换事件与真实执行轮次区别处理；完成物理清理后允许重放保留的正文投影，并在发布同步前继续阻止新任务；模块依赖通过现有 SQLite 包加载。原 SQLite 安装包和校验清单不修改。

tgz 含插件源码、全部桥接模块、源码安装及还原脚本、检查和验收说明。SQLite 后端是独立依赖，需按上游说明安装。tests 是本次本机 review 夹具测试，部分依赖本机真实 DSH SDK 和隔离部署目录，不是脱离该环境即可运行的通用测试套件。
