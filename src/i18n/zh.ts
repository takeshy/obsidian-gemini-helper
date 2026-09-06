// Chinese (Simplified) translations
export const zh: Record<string, string> = {
  // Settings - Headings
  "settings.externalSkills": "外部技能",

  // Settings - API
  "settings.googleApiKey": "Google API 密钥",
  "settings.googleApiKey.desc": "您的 ai.google.dev API 密钥。密钥保存在此设备的本地密钥存储中，因此需要在每台同步设备上分别输入。",
  "settings.googleApiKey.missingOnDevice": "此仓库已配置 Google API 密钥，但该密钥未保存在此设备上。请在 Gemini Helper 设置中输入 API 密钥。",
  "settings.apiPlan": "API 计划",
  "settings.apiPlan.desc": "选择 API 密钥的计划类型（影响可用模型和搜索功能）",
  "settings.apiPlan.paid": "付费",
  "settings.apiPlan.free": "免费",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "AI 可自动访问的文件夹",
  "settings.aiVaultToolAllowedFolders.desc": "可选：如果有不想让 AI 自动读取的目录，请只指定 AI 可以访问的文件夹。",
  "settings.aiVaultToolAllowedFolders.invalidPath": "文件夹必须是相对于仓库的路径，且不能包含 . 或 .. 路径段。",
  "settings.aiVaultToolAllowedFolders.placeholder": "例如：public, shared/docs",
  "settings.externalSkillsRepository": "源仓库",
  "settings.externalSkillsRepository.desc": "技能从官方仓库 {{repo}} 导入并复制到 vault 的 skills/ 文件夹。每个技能必须包含 manifest.json。",
  "settings.externalSkills.retry": "重试",
  "settings.externalSkills.loading": "正在加载可用技能…",
  "settings.externalSkills.loadFailed": "加载技能失败：{{error}}",
  "settings.externalSkills.noSkills": "在官方仓库中未找到兼容的技能。",
  "settings.externalSkills.allInstalled": "所有可用技能均已安装。",
  "settings.externalSkills.install": "安装技能",
  "settings.externalSkills.install.desc": "从官方仓库中选择一个技能并安装。",
  "settings.externalSkills.installButton": "安装",
  "settings.externalSkills.installSkipped": "无法安装 {{id}}：{{reason}}",
  "settings.externalSkills.installed": "已安装的技能",
  "settings.externalSkills.noVersion": "无版本",
  "settings.externalSkills.updateAvailable": "有可用更新",
  "settings.externalSkills.check": "检查更新",
  "settings.externalSkills.upToDate": "已是最新版本 (v{{version}})。",
  "settings.externalSkills.notInCatalog": "此技能不在官方仓库中。",
  "settings.externalSkills.updateConfirm": "将 {{name}} 从 v{{from}} 更新到 v{{to}}？",
  "settings.importSkills": "导入技能",
  "settings.importSkills.done": "已导入 {{skills}} 个技能，{{files}} 个文件",
  "settings.importSkills.failed": "导入技能失败：{{error}}",
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "存储模式",
  "settings.storeMode.desc": "内部：同步库文件。外部：使用现有的语义搜索存储。",
  "settings.storeModeInternal": "内部（库同步）",
  "settings.storeModeExternal": "外部（现有存储）",
  "settings.storeIds": "语义搜索存储 ID",
  "settings.storeIds.desc": "外部语义搜索存储 ID（每行一个）",
  "settings.storeIds.placeholder": "例如：fileSearchStores/xxx",
  "settings.storeCount": "存储数量",
  "settings.storeCountDesc": "已配置 {{count}} 个存储",
  "settings.currentStoreId": "当前存储 ID",
  "settings.copyStoreId": "复制存储 ID",
  "settings.storeIdCopied": "存储 ID 已复制到剪贴板",
  "settings.metadataFilter": "元数据过滤器",
  "settings.metadataFilter.desc": "在查询时应用的可选元数据过滤器，使用 path、extension、basename、folder、modified 和 size 等内部同步元数据",
  "settings.metadataFilter.placeholder": "按扩展名或文件夹过滤",
  "settings.metadataFilter.help": "显示元数据过滤器语法",
  "settings.metadataFilter.helpTitle": "元数据过滤器语法",
  "settings.metadataFilter.helpIntro": "元数据过滤器在查询时限制文件搜索结果。使用字符串比较、数值比较以及 and/or 来组合条件。",
  "settings.metadataFilter.helpKeys": "可用元数据",
  "settings.metadataFilter.helpKeyPath": "vault 相对文件路径",
  "settings.metadataFilter.helpKeyExtension": "小写文件扩展名",
  "settings.metadataFilter.helpKeyBasename": "不含扩展名的文件名",
  "settings.metadataFilter.helpKeyFolder": "上级文件夹路径",
  "settings.metadataFilter.helpKeyModified": "以 unix 纪元毫秒表示的修改时间",
  "settings.metadataFilter.helpKeySize": "以字节为单位的文件大小",
  "settings.metadataFilter.helpExamples": "示例",
  "settings.metadataFilter.helpNote": "modified 值使用毫秒时间戳。使用前请将日期转换为毫秒。",

  // Settings - Sync
  "settings.syncVault": "同步库",
  "settings.syncStatus": "{{count}} 个文件已索引 | 上次同步：{{lastSync}}",
  "settings.syncing": "同步中...",
  "settings.syncUploading": "上传中",
  "settings.syncSkipping": "跳过",
  "settings.syncDeleting": "删除中",
  "settings.syncResult": "同步：{{uploaded}} 个已上传，{{skipped}} 个已跳过，{{deleted}} 个已删除",
  "settings.resetSyncState": "重置同步状态",
  "settings.resetSyncState.desc": "清除本地同步状态。下次同步将重新上传所有文件。",
  "settings.resetSyncStateConfirm": "确定要重置同步状态吗？",
  "settings.deleteStore": "删除语义搜索存储",
  "settings.deleteStore.desc": "删除当前语义搜索存储和服务器上的所有索引数据",
  "settings.deleteStoreConfirm": "确定要删除语义搜索存储吗？这将从服务器删除所有索引数据。此操作无法撤消。",
  "settings.storeDeleted": "语义搜索存储已删除",
  "settings.deleteStoreFailed": "删除存储失败：{{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "查看文件",
  "settings.ragFiles.title": "{{name}} 中的文件",
  "settings.ragFiles.searchPlaceholder": "搜索文件...",
  "settings.ragFiles.filterAll": "全部",
  "settings.ragFiles.filterRegistered": "已注册",
  "settings.ragFiles.filterPending": "待处理",
  "settings.ragFiles.noFiles": "未找到文件",
  "settings.ragFiles.registered": "已注册",
  "settings.ragFiles.pending": "待处理",
  "settings.ragFiles.fileCount": "{{count}} 个文件",

  // Common buttons
  "common.ok": "确定",
  "common.error": "错误：",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "名称不能为空",
  "modal.name": "名称",
  "modal.enterName": "输入名称",

  // Chat
  "chat.savedAsNote": "已保存到 {{path}}",
  "chat.chatDeleted": "聊天已删除",
  "chat.rateLimitPaid": "此模型可能已达到速率限制。请尝试使用其他模型直到明天。",
  "chat.extendToolLimitTitle": "扩展工具调用上限？",
  "chat.extendToolLimitMessage": "助手还剩 {{remaining}} 次工具调用（已使用 {{used}}/{{currentLimit}}）。是否为本次响应增加调用次数？",
  "chat.extendToolLimitInput": "额外工具调用次数",
  "chat.extendToolLimitConfirm": "增加调用",
  "chat.errorOccurred": "抱歉，发生错误：{{message}}",
  "chat.unknownError": "未知错误",
  "chat.helpTitle": "Gemini Helper 帮助",
  "chat.helpDescription": "启用内置的帮助知识库，即可询问有关 Gemini Helper 功能、设置、工作流、搜索、仪表板和故障排除的问题。",
  "chat.askGeminiHelperHelp": "咨询 Gemini Helper 相关问题",
  "chat.helpQuestionDraft": "Gemini Helper 能做什么？",
  "chat.yesterday": "昨天",

  // InputArea
  "okf.builtinHelpDescription": "内置的 Gemini Helper 功能参考",
  "input.knowledgeLabel": "知识来源",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types

  // Workflow Panel - UI Strings
  "workflow.generation.outputPathTaken": "{{path}} 已包含一个工作流。请选择不同的输出路径。",
  "workflow.multipleBlocksInFile": "在单个文件中发现多个工作流块。每个文件只能包含一个工作流；请手动拆分文件或使用迁移操作。",
  "workflow.migrateConfirm": "此文件包含多个工作流块。是否将其中 {{count}} 个拆分到新的同级文件中？\n\n{{files}}\n\n原始文件保留第一个工作流。引用了原始文件路径的技能功能、快捷键或事件触发器仍与第一个工作流关联——如有需要，请手动将它们指向新文件。",
  "workflow.migrateNothingToDo": "此文件不包含多个工作流块。",
  "workflow.migrateSuccess": "迁移完成：已将 {{count}} 个工作流拆分到同级文件中。",

  // Common - Edit

  // Edit Confirmation Modal

  // Value Prompt Modal

  // Dialog Prompt Modal (titles passed dynamically)

  // Edit History

  // Workflow Modals

  // Edit History Modal

  // Diff Modal

  // Edit History Buttons

  // Status bar

  // Commands

  // Workflow Selector Modal

  // Errors

  // Encryption
  "settings.encryption": "加密",
  "settings.encryptChatHistory": "加密 AI 聊天历史",
  "settings.encryptChatHistory.desc": "加密 AI 聊天历史文件。查看内容需要密码。",
  "settings.encryptWorkflowHistory": "加密工作流执行日志",
  "settings.encryptWorkflowHistory.desc": "加密工作流执行日志文件。查看内容需要密码。",
  "settings.encryptionSetup": "设置加密",
  "settings.encryptionSetup.desc": "生成加密密钥。无需密码即可加密，但需要密码才能解密。",
  "settings.encryptionSetupBtn": "设置加密密钥",
  "settings.encryptionPassword": "加密密码",
  "settings.encryptionPassword.desc": "用于保护私钥的密码。解密时需要。",
  "settings.encryptionPassword.placeholder": "输入密码",
  "settings.encryptionConfirmPassword": "确认密码",
  "settings.encryptionConfirmPassword.placeholder": "确认密码",
  "settings.encryptionPasswordMismatch": "密码不匹配",
  "settings.encryptionSetupSuccess": "加密密钥已成功生成",
  "settings.encryptionSetupFailed": "加密设置失败：{{error}}",
  "settings.encryptionConfigured": "加密已配置",
  "settings.encryptionConfigured.desc": "加密密钥已设置。在下方选择要加密的日志类型。",
  "settings.encryptionResetKeys": "重置加密密钥",
  "settings.encryptionResetKeys.desc": "生成新的加密密钥。之前加密的聊天将无法读取。",
  "settings.encryptionResetKeysConfirm": "重置加密密钥？所有之前加密的聊天历史将无法读取。",
  "settings.encryptionKeysReset": "加密密钥已重置",

  // Decryption
  "chat.encryptedChat": "加密聊天",
  "chat.decryptFailed": "解密失败。请检查您的密码。",
  "chat.decrypted": "解密成功",

  // Workflow Generation Modal

  // Workflow Preview Modal

  // Workflow Confirm Modal

  // Execution History Select Modal

  // Workflow Execution Modal

  // CryptView - File Encryption

  // MCP Server Settings

  // Input - MCP tool hint

  // Skills Settings

  // Skills UI

  // HTML Preview Modal

  // AI Workflow Modal
  "aiWorkflow.pastePlaceholder": "粘贴 Claude、GPT 等输出的 Markdown（包含 ```workflow 块）或 YAML...",

  // Edit History Modal

  // Node Editor Modal

  // MCP Apps

  // Langfuse settings

  // Dashboard
};
