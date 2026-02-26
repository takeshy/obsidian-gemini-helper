# GemiHub Connection (Google Drive Sync)

将您的 Obsidian vault 与 Google Drive 同步，完全兼容 [GemiHub](https://gemihub.online)。在 Obsidian 中编辑笔记并从 GemiHub 的网页界面访问，反之亦然。

## 什么是 GemiHub？

[GemiHub](https://gemihub.online) 是一个将 Google Gemini 转变为与您的 Google Drive 集成的个人 AI 助手的 Web 应用程序。

![GemiHub 界面](images/gemihub_connection/push_pull.png)

### GemiHub 独有功能

以下功能仅通过 GemiHub 的网页界面提供，Obsidian 插件无法单独实现：

- **Automatic RAG** - 同步到 GemiHub 的文件会自动索引以进行语义搜索。与 Obsidian 插件的手动 RAG 同步不同，GemiHub 在每次同步时自动索引文件，无需额外设置。
- **OAuth2-enabled MCP** - 使用需要 OAuth2 认证的 MCP 服务器（例如 Google Calendar、Gmail、Google Docs）。Obsidian 插件仅支持基于 header 的 MCP 认证。
- **Markdown to PDF/HTML conversion** - 直接在 GemiHub 中将您的 Markdown 笔记转换为格式化的 PDF 或 HTML 文档。
- **Public publishing** - 使用可共享的公开 URL 发布转换后的 HTML/PDF 文档，方便对外分享笔记。

### 通过连接为 Obsidian 添加的功能

启用 Google Drive 同步后，以下功能在 Obsidian 端可用：

- **带 diff 预览的双向同步** - Push 和 pull 文件时提供详细的文件列表和 unified diff 视图，在提交更改前进行确认
- **带 diff 的冲突解决** - 当同一文件在两端都被编辑时，冲突模态框显示彩色 unified diff，帮助您决定保留哪个版本
- **Drive 编辑历史** - 跟踪来自 Obsidian 和 GemiHub 两端的更改，按文件显示历史条目并标注来源（本地/远程）
- **冲突备份管理** - 浏览、预览和恢复存储在 Drive 上的冲突备份

## 同步概述

- **双向同步** - 将本地更改 push 到 Drive，将远程更改 pull 到 Obsidian
- **GemiHub 兼容** - 使用与 GemiHub 相同的 `_sync-meta.json` 格式和加密认证
- **冲突解决** - 当双方编辑同一文件时检测并解决冲突
- **选择性同步** - 通过模式匹配排除文件/文件夹
- **二进制支持** - 同步图像、PDF 和其他二进制文件

## 前提条件

您需要一个已配置 Google Drive 同步的 [GemiHub](https://gemihub.online) 账户。插件使用 GemiHub 的加密认证令牌连接到您的 Google Drive。

1. 登录 GemiHub
2. 前往 **Settings** → **Obsidian Sync** 部分
3. 复制 **Migration Tool token**

![Migration Tool Token](images/gemihub_connection/migration_tool.png)

## 设置

1. 打开 Obsidian **Settings** → **Gemini Helper** → 滚动到 **Google Drive sync**
2. 开启 **Enable drive sync**

![启用 Drive 同步](images/gemihub_connection/setting_drive_sync.png)

3. 粘贴从 GemiHub 复制的 **Migration Tool token**
4. 点击 **Setup** 从 Google Drive 获取加密认证信息

![Migration Tool Token 设置](images/gemihub_connection/setting_migration_tool_token.png)

5. 输入您的**密码**以解锁当前会话的同步

![Drive Sync 解锁](images/gemihub_connection/start_with_sync.png)

> 每次重启 Obsidian 时，您都需要输入密码来解锁同步会话。

## 同步工作原理

### Drive 上的文件存储

所有 vault 文件都以**扁平**结构存储在 Drive 的根文件夹中。Drive 上的文件名包含 vault 的完整路径：

| Vault 路径 | Drive 文件名 |
|---|---|
| `notes.md` | `notes.md` |
| `daily/2024-01-15.md` | `daily/2024-01-15.md` |
| `attachments/image.png` | `attachments/image.png` |

这意味着 Drive 上没有子文件夹（系统文件夹如 `trash/`、`sync_conflicts/`、`__TEMP__/` 除外）。GemiHub 使用相同的扁平结构。

### 同步元数据

两个元数据文件跟踪同步状态：

- **`_sync-meta.json`**（在 Drive 上）- 与 GemiHub 共享。包含所有已同步文件的文件 ID、校验和和时间戳。
- **`{workspaceFolder}/drive-sync-meta.json`**（本地）- 将 vault 路径映射到 Drive 文件 ID，并存储上次同步的校验和。

### Push

将本地更改上传到 Google Drive。

1. 计算所有 vault 文件的 MD5 校验和
2. 与本地同步元数据比较以查找已更改的文件
3. 如果远程有待处理的更改，push 将被拒绝（请先 pull）
4. 将新文件/修改的文件上传到 Drive
5. 将本地删除的文件移动到 Drive 的 `trash/`（软删除）
6. 更新 Drive 上的 `_sync-meta.json`

![Push 到 Drive](images/gemihub_connection/push.png)

### Pull

将远程更改下载到 vault。

1. 获取远程 `_sync-meta.json`
2. 计算本地校验和以检测本地更改
3. 如果存在冲突，显示冲突解决模态框
4. 删除仅存在于本地的文件（移动到 Obsidian 回收站）
5. 将新的/修改的远程文件下载到 vault
6. 更新本地同步元数据

![Pull 到本地](images/gemihub_connection/pull_to_local.png)

### Full Pull

用远程版本替换所有本地文件。使用此功能可将 vault 重置为与 Drive 一致。

> **警告：** 这将删除 Drive 上不存在的本地文件（移动到 Obsidian 回收站）。

### 冲突解决

当同一文件在本地和远程都被修改时：

- 模态框显示所有冲突的文件
- 对于每个文件，选择 **Keep local** 或 **Keep remote**
- 未被选择的版本将备份到 Drive 的 `sync_conflicts/`
- **编辑-删除冲突**（本地编辑，远程删除）提供 **Restore (push to drive)** 或 **Accept delete** 选项
- 批量操作：**Keep all local** / **Keep all remote**

![冲突解决](images/gemihub_connection/conflict.png)

点击 **Diff** 查看本地和远程版本之间的彩色 Unified Diff：

![冲突 Diff 视图](images/gemihub_connection/conflict_diff.png)

## 数据管理

### 回收站

同步期间删除的文件会移动到 Drive 的 `trash/` 文件夹，而不是永久删除。在设置中，您可以：

- **Restore** - 将文件从回收站移回根文件夹
- **Delete permanently** - 从 Drive 永久删除文件

### 冲突备份

当冲突解决后，未被选择的版本会保存在 Drive 的 `sync_conflicts/` 中。您可以：

- **Restore** - 将备份恢复到根文件夹（覆盖当前版本）
- **Delete** - 永久删除备份

![冲突备份](images/gemihub_connection/conflict_backup.png)

### 临时文件

GemiHub 临时保存的文件存储在 Drive 的 `__TEMP__/` 中。您可以：

- **Apply** - 将临时文件内容应用到对应的 Drive 文件
- **Delete** - 删除临时文件

三个管理模态框都支持文件预览和批量操作。

## 设置

| 设置项 | 描述 | 默认值 |
|---|---|---|
| **Enable drive sync** | 切换同步功能 | Off |
| **Migration Tool token** | 从 GemiHub 设置（Obsidian Sync 部分）粘贴 | - |
| **Auto sync check** | 定期检查远程更改并更新计数 | Off |
| **Sync check interval** | 检查频率（分钟） | 5 |
| **Exclude patterns** | 要排除的路径（每行一个，支持 `*` 通配符） | `node_modules/` |

## 命令

命令面板中提供四个命令：

| 命令 | 描述 |
|---|---|
| **Drive sync: push to drive** | 将本地更改 push 到 Drive |
| **Drive sync: pull to local** | 将远程更改 pull 到 vault |
| **Drive sync: full push to drive** | 将所有本地文件 push 到 Drive |
| **Drive sync: full pull to local** | 用远程版本替换所有本地文件 |

## 排除的文件

以下内容始终从同步中排除：

- `_sync-meta.json`、`settings.json`
- `history/`、`trash/`、`sync_conflicts/`、`__TEMP__/`、`plugins/`、`.trash/`、`node_modules/`
- Obsidian 配置目录（`.obsidian/` 或自定义目录）
- 设置中用户定义的排除模式

### 排除模式语法

- `folder/` - 排除文件夹及其内容
- `*.tmp` - 通配符模式（匹配所有 `.tmp` 文件）
- `*.log` - 通配符模式（匹配所有 `.log` 文件）
- `drafts/` - 排除 `drafts` 文件夹

## 故障排除

### "Remote has pending changes. Please pull first."

远程 Drive 有尚未 pull 的更改。请在 push 之前先运行 **Pull to local**。

### "Drive sync: no remote data found. Push first."

Drive 上不存在 `_sync-meta.json`。运行 **Push to drive** 以初始化同步。

### 密码解锁失败

- 确认您使用的是与 GemiHub 相同的密码
- 如果您在 GemiHub 中更改了密码，请在设置中使用 **Reset auth** 并使用新的 Migration Tool token 重新设置

### 冲突模态框持续出现

双方都有更改。请为每个文件选择本地或远程来解决所有冲突。解决所有冲突后，pull 将自动继续。
