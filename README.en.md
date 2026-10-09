# DSHT Message Actions

[简体中文](./README.md) | **English**

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)
[![DSHT 2.5.0](https://img.shields.io/badge/DSHT-2.5.0-orange.svg)](UPGRADE-5026.md)
[![Version](https://img.shields.io/badge/version-0.2.1--preview.1-yellow.svg)](package.json)

Adds copy, edit, branch, delete-latest-turn, and roll-back-to-this-turn actions to DeepSeek Tavern (DSHT) messages. A standalone DSH plugin provides the buttons. Editing and history cleanup require a matching DSHT host bridge and SQLite V2.

> **Preview release.** This version targets a specific DSHT 2.5.0 commit. The bridge changes DSHT source files. Keep a recoverable source copy and validate the installation in an isolated environment first.

## Features

| Action | Description |
| --- | --- |
| Copy | Copy a user message or assistant reply. |
| Edit historical reply | Edit a non-opening assistant reply while keeping later story content and settled variables. Future model context uses the edited text. |
| Branch | Create an isolated copy from the latest turn, including the character card, resource snapshot, and foreground/background Sessions for SQLite saves. |
| Delete latest turn | Delete the latest complete user message and assistant reply. |
| Roll back to this turn | Keep the selected turn, remove later story and related save history, and restore that turn's rollback baseline. |

Actions are refused when a safe replacement boundary, complete snapshot, or verifiable Session boundary is missing. Editing a reply does not recalculate already-settled variables. SQLite branching currently supports only the latest turn.

## Install

Requires DSH, the source for DSHT 2.5.0, and SQLite V2 0.3.5-preview.1. The bridge depends on the full SQLite V2 backend and its standard host patch. Install those first, following the [SQLite V2 project instructions](https://github.com/huajiao1998/dsh-tavern-sqlite-v2).

### 1. Check and apply the host bridge

Run from this repository. The default command only checks. `--apply` validates source anchors and client syntax before backing up and changing host files.

```powershell
node .\install-bridge.mjs 'F:\your\DSHT\source'
node .\install-bridge.mjs 'F:\your\DSHT\source' --apply
```

### 2. Install and enable the plugin

Install `dsh-tavern-message-actions-0.2.1-preview.1.tgz` with the DSH plugin manager, enable its bundle, restart the service, and refresh the page. To package it from source, run:

```powershell
npm pack
dsh plugin --profile web add .\dsh-tavern-message-actions-0.2.1-preview.1.tgz
```

Replace `web` with your Profile name. Confirm the DSH plugin command and target Profile before deployment.

### Upgrade or remove the bridge

Before updating DSHT or SQLite V2, restore the host source with the current bridge's `--restore`, then follow the [upgrade instructions](UPGRADE-5026.md). Restoring the bridge does not disable the DSH plugin; disable it separately.

```powershell
node .\install-bridge.mjs 'F:\your\DSHT\source' --restore
```

## Deletion scope

Rollback cleans the current SQLite save and its associated Session history. Independent branches, earlier exports, and shared attachment entities are not deleted. This is not forensic disk erasure. Confirm the selected save and keep separate backups of important data.

## Compatibility and notes

- DSHT target: version 2.5.0, commit [`5026df7f`](https://github.com/flizzywine/dsh-tavern/commit/5026df7f61dfdbe463a0a58ca0edc8edffc6b2c6).
- Matching SQLite version: 0.3.5-preview.1.
- `preview.html` is a standalone UI demo and does not connect to a real save.
- See [check records](CHECKS.md) and the [end-to-end report](E2E-REPORT.md) for current validation scope and limitations.

This package includes bridge code adapted from [dsh-tavern-sqlite-v2](https://github.com/huajiao1998/dsh-tavern-sqlite-v2). See [THIRD_PARTY.md](THIRD_PARTY.md) for source and modification details, and [LICENSE](LICENSE) for the full license.
