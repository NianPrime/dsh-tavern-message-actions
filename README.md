# DSHT 消息操作

**简体中文** | [English](./README.en.md)

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)
[![DSHT 2.5.0](https://img.shields.io/badge/DSHT-2.5.0-orange.svg)](UPGRADE-5026.md)
[![Version](https://img.shields.io/badge/version-0.2.1--preview.1-yellow.svg)](package.json)

给 DeepSeek Tavern（DSHT）消息补上复制、正文编辑、分支、删除本轮和回退到此轮操作。消息按钮由独立 DSH 插件提供；编辑与历史清理需要配套的 DSHT 宿主桥接和 SQLite V2。

> **Preview 版本。** 本版按 DSHT 2.5.0 的指定提交适配。桥接会修改 DSHT 源码，安装前请保留可回退的源码副本，并先在隔离环境验收。

## 功能

| 操作 | 说明 |
| --- | --- |
| 复制 | 复制用户输入或角色回复正文。 |
| 编辑历史正文 | 修改非开场的角色回复；保留后续剧情和已结算变量，并让后续模型读取编辑后的正文。 |
| 分支 | 从最新一轮创建隔离副本；SQLite 存档会连同角色卡、资源快照及前后台 Session 一起复制。 |
| 删除本轮 | 删除最新完整用户输入和角色回复。 |
| 回退到此轮 | 保留所选轮次，清除其后的剧情与对应存档历史，并恢复该轮回退基准。 |

操作会在缺少安全替换边界、完整快照或可核实的 Session 边界时拒绝执行。历史正文编辑不会重新计算已经结算的变量。SQLite 分支目前只支持最新一轮。

## 安装

需要 DSH、DSHT 2.5.0 对应源码，以及 SQLite V2 0.3.5-preview.1。桥接依赖 SQLite V2 的完整后端与标准宿主补丁；请先按 [SQLite V2 项目说明](https://github.com/huajiao1998/dsh-tavern-sqlite-v2)完成安装，再安装本插件。

### 1. 检查并应用宿主桥接

在本仓库目录运行。默认只检查；`--apply` 会先验证源码锚点和客户端语法，再备份并写入宿主文件。

```powershell
node .\install-bridge.mjs 'F:\你的DSHT源码'
node .\install-bridge.mjs 'F:\你的DSHT源码' --apply
```

### 2. 安装并启用插件

用 DSH 插件管理器安装 `dsh-tavern-message-actions-0.2.1-preview.1.tgz`，启用插件 bundle，然后重启服务并刷新页面。若从源码安装，可在仓库目录打包后把生成的 tgz 交给插件管理器：

```powershell
npm pack
dsh plugin --profile web add .\dsh-tavern-message-actions-0.2.1-preview.1.tgz
```

将 `web` 替换为实际 Profile 名。部署前请核对所用的 DSH 插件管理命令和目标 Profile。

### 升级或卸载桥接

更新 DSHT 或 SQLite V2 前，先用当前桥接的 `--restore` 还原宿主源码，再按 [新版适配说明](UPGRADE-5026.md)顺序更新依赖并重新安装。恢复桥接不会停用 DSH 插件；停用插件需另行操作。

```powershell
node .\install-bridge.mjs 'F:\你的DSHT源码' --restore
```

## 删除范围

回退会清理当前 SQLite 存档及其所属 Session 历史。独立分支、此前导出的备份和共享附件实体不随之删除；这不等同于磁盘取证级擦除。开始操作前请确认选中的存档，并保留重要数据的独立备份。

## 兼容性与说明

- DSHT 目标版本为 2.5.0，适配提交 [`5026df7f`](https://github.com/flizzywine/dsh-tavern/commit/5026df7f61dfdbe463a0a58ca0edc8edffc6b2c6)。
- SQLite 配套版本为 0.3.5-preview.1。
- `preview.html` 是不连接真实存档的独立界面演示。
- 当前版本的检查范围和已知限制见 [检查记录](CHECKS.md) 与 [端到端验收记录](E2E-REPORT.md)。

本包包含改编自 [dsh-tavern-sqlite-v2](https://github.com/huajiao1998/dsh-tavern-sqlite-v2) 的桥接代码。来源、改动范围和许可证说明见 [THIRD_PARTY.md](THIRD_PARTY.md)；许可全文见 [LICENSE](LICENSE)。
