import type { SharedTranslationKey } from "obsidian-llm-hub-common/i18n";

// English translations (base language)
export const en = {
  // Settings - Headings
  "settings.externalSkills": "External skills",

  // Settings - API
  "settings.googleApiKey": "Google API key",
  "settings.googleApiKey.desc": "Your API key from AI.google" + ".dev. It is stored securely on this device and must be entered separately on each synced device.",
  "settings.googleApiKey.missingOnDevice": "A Google API key is configured for this vault, but is not stored on this device. Enter it in Gemini Helper settings to use Gemini here.",
  "settings.apiPlan": "API plan",
  "settings.apiPlan.desc": "Select the plan type for your API key (affects available models and search features)",
  "settings.apiPlan.paid": "Paid",
  "settings.apiPlan.free": "Free",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "Folders AI can access automatically",
  "settings.aiVaultToolAllowedFolders.desc": "Optional: if there are directories you do not want the AI to read automatically, specify only the folders the AI may access.",
  "settings.aiVaultToolAllowedFolders.invalidPath": "Folders AI can access automatically must be vault-relative folders and cannot contain '.' or '..' segments.",
  "settings.aiVaultToolAllowedFolders.placeholder": "E.g., public, shared/docs",

  // Settings - External skills
  "settings.externalSkillsRepository": "Source repository",
  "settings.externalSkillsRepository.desc": "Skills are imported from the official repository {{repo}} and copied into the vault skills/ folder. Each skill must include a manifest.json.",
  "settings.externalSkills.retry": "Retry",
  "settings.externalSkills.loading": "Loading available skills…",
  "settings.externalSkills.loadFailed": "Failed to load skills: {{error}}",
  "settings.externalSkills.noSkills": "No compatible skills found in the official repository.",
  "settings.externalSkills.allInstalled": "All available skills are already installed.",
  "settings.externalSkills.install": "Install a skill",
  "settings.externalSkills.install.desc": "Select a skill from the official repository and install it.",
  "settings.externalSkills.installButton": "Install",
  "settings.externalSkills.installSkipped": "Could not install {{id}}: {{reason}}",
  "settings.externalSkills.installed": "Installed skills",
  "settings.externalSkills.noVersion": "No version",
  "settings.externalSkills.updateAvailable": "Update available",
  "settings.externalSkills.check": "Check for updates",
  "settings.externalSkills.upToDate": "Already up to date (v{{version}}).",
  "settings.externalSkills.notInCatalog": "This skill is not in the official repository.",
  "settings.externalSkills.updateConfirm": "Update {{name}} from v{{from}} to v{{to}}?",
  "settings.importSkills": "Import skills",
  "settings.importSkills.done": "Imported {{skills}} skill(s), {{files}} file(s)",
  "settings.importSkills.failed": "Failed to import skills: {{error}}",

  // Settings - Knowledge sources
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "Store mode",
  "settings.storeMode.desc": "Internal: sync your vault files. External: use an existing semantic search store.",
  "settings.storeModeInternal": "Internal (vault sync)",
  "settings.storeModeExternal": "External (existing store)",
  "settings.storeIds": "Semantic search store ids",
  "settings.storeIds.desc": "External semantic search store ids (one per line)",
  "settings.storeIds.placeholder": "E.g., fileSearchStores/xxx",
  "settings.storeCount": "Store count",
  "settings.storeCountDesc": "{{count}} store(s) configured",
  "settings.currentStoreId": "Current store ID",
  "settings.copyStoreId": "Copy store ID",
  "settings.storeIdCopied": "Store ID copied to clipboard",
  "settings.metadataFilter": "Metadata filter",
  "settings.metadataFilter.desc": "Optional metadata filter applied at query time, with internal sync metadata such as path, extension, basename, folder, modified, and size",
  "settings.metadataFilter.placeholder": "Filter by extension or folder",
  "settings.metadataFilter.help": "Show metadata filter syntax",
  "settings.metadataFilter.helpTitle": "Metadata filter syntax",
  "settings.metadataFilter.helpIntro": "Metadata filters limit file search results at query time. Use string comparisons, numeric comparisons, and and/or to combine conditions.",
  "settings.metadataFilter.helpKeys": "Available metadata",
  "settings.metadataFilter.helpKeyPath": "Vault-relative file path",
  "settings.metadataFilter.helpKeyExtension": "Lowercase file extension",
  "settings.metadataFilter.helpKeyBasename": "File name without extension",
  "settings.metadataFilter.helpKeyFolder": "Parent folder path",
  "settings.metadataFilter.helpKeyModified": "Modified time as unix epoch milliseconds",
  "settings.metadataFilter.helpKeySize": "File size in bytes",
  "settings.metadataFilter.helpExamples": "Examples",
  "settings.metadataFilter.helpNote": "The modified value uses millisecond timestamps. Convert dates to milliseconds before using them.",

  // Settings - Sync
  "settings.syncVault": "Sync vault",
  "settings.syncStatus": "{{count}} files indexed | Last sync: {{lastSync}}",
  "settings.syncing": "Syncing...",
  "settings.syncUploading": "Uploading",
  "settings.syncSkipping": "Skipping",
  "settings.syncDeleting": "Deleting",
  "settings.syncResult": "Sync: {{uploaded}} uploaded, {{skipped}} skipped, {{deleted}} deleted",
  "settings.resetSyncState": "Reset sync state",
  "settings.resetSyncState.desc": "Clear the local sync state. Next sync will re-upload all files.",
  "settings.resetSyncStateConfirm": "Are you sure you want to reset the sync state?",
  "settings.deleteStore": "Delete semantic search store",
  "settings.deleteStore.desc": "Delete the current semantic search store and all indexed data from the server",
  "settings.deleteStoreConfirm": "Are you sure you want to delete the semantic search store? This will remove all indexed data from the server. This cannot be undone.",
  "settings.storeDeleted": "Semantic search store deleted",
  "settings.deleteStoreFailed": "Failed to delete store: {{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "View files",
  "settings.ragFiles.title": "Files in {{name}}",
  "settings.ragFiles.searchPlaceholder": "Search files...",
  "settings.ragFiles.filterAll": "All",
  "settings.ragFiles.filterRegistered": "Registered",
  "settings.ragFiles.filterPending": "Pending",
  "settings.ragFiles.noFiles": "No files found",
  "settings.ragFiles.registered": "Registered",
  "settings.ragFiles.pending": "Pending",
  "settings.ragFiles.fileCount": "{{count}} files",

  // Common buttons
  "common.ok": "OK",
  "common.error": "Error: ",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "Name cannot be empty",
  "modal.name": "Name",
  "modal.enterName": "Enter name",

  // Chat
  "chat.savedAsNote": "Saved as {{path}}",
  "chat.chatDeleted": "Chat deleted",
  "chat.rateLimitPaid": "This model may be rate limited. Please try a different model until tomorrow.",
  "chat.extendToolLimitTitle": "Extend tool call limit?",
  "chat.extendToolLimitMessage": "The assistant has {{remaining}} tool calls remaining ({{used}}/{{currentLimit}} used). Add more calls for this response?",
  "chat.extendToolLimitInput": "Additional tool calls",
  "chat.extendToolLimitConfirm": "Add calls",
  "chat.errorOccurred": "Sorry, an error occurred: {{message}}",
  "chat.unknownError": "Unknown error",
  "chat.helpTitle": "Gemini Helper help",
  "chat.helpDescription": "Enable the built-in help knowledge bundle and ask about Gemini Helper features, settings, workflows, search, dashboards, and troubleshooting.",
  "chat.askGeminiHelperHelp": "Ask about Gemini Helper",
  "chat.helpQuestionDraft": "What can Gemini Helper do?",
  "chat.yesterday": "Yesterday",

  // InputArea
  "okf.builtinHelpDescription": "Built-in Gemini Helper feature reference",
  "input.knowledgeLabel": "Knowledge sources",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types
  "workflow.nodeType.ragSync": "Rag sync",

  // Workflow Panel - UI Strings

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
  "settings.encryption": "Encryption",
  "settings.encryptChatHistory": "Encrypt AI chat history",
  "settings.encryptChatHistory.desc": "Encrypt AI chat history files. Requires password to view content.",
  "settings.encryptWorkflowHistory": "Encrypt workflow execution logs",
  "settings.encryptWorkflowHistory.desc": "Encrypt workflow execution log files. Requires password to view content.",
  "settings.encryptionSetup": "Setup encryption",
  "settings.encryptionSetup.desc": "Generate encryption keys. You can encrypt without password, but need password to decrypt.",
  "settings.encryptionSetupBtn": "Setup encryption keys",
  "settings.encryptionPassword": "Encryption password",
  "settings.encryptionPassword.desc": "Password to protect private key. Required for decryption.",
  "settings.encryptionPassword.placeholder": "Enter password",
  "settings.encryptionConfirmPassword": "Confirm password",
  "settings.encryptionConfirmPassword.placeholder": "Confirm password",
  "settings.encryptionPasswordMismatch": "Passwords do not match",
  "settings.encryptionSetupSuccess": "Encryption keys generated successfully",
  "settings.encryptionSetupFailed": "Failed to setup encryption: {{error}}",
  "settings.encryptionConfigured": "Encryption configured",
  "settings.encryptionConfigured.desc": "Encryption keys are set up. Choose which logs to encrypt below.",
  "settings.encryptionResetKeys": "Reset encryption keys",
  "settings.encryptionResetKeys.desc": "Generate new encryption keys. Previous encrypted chats will not be readable.",
  "settings.encryptionResetKeysConfirm": "Reset encryption keys? All previously encrypted chat history will become unreadable.",
  "settings.encryptionKeysReset": "Encryption keys have been reset",

  // Decryption
  "chat.encryptedChat": "Encrypted chat",
  "chat.decryptFailed": "Decryption failed. Check your password.",
  "chat.decrypted": "Decrypted successfully",

  // Workflow Generation Modal

  // Workflow Preview Modal

  // Workflow Confirm Modal

  // Execution History Select Modal

  // Workflow Execution Modal

  // CryptView - File Encryption

  // Skills Settings

  // Skills UI

  // MCP Server Settings

  // Input - MCP tool hint

  // HTML Preview Modal

  // AI Workflow Modal
  "aiWorkflow.pastePlaceholder": "Paste the markdown (with ```workflow blocks) or YAML from Claude, GPT, etc...",

  // Edit History Modal

  // Node Editor Modal
  "nodeEditor.ragSetting": "Rag setting",
  "nodeEditor.ragSetting.select": "Select rag setting",

  // MCP Apps

  // Langfuse settings

  // Dashboard
};

/** This plugin's own keys, plus everything the shared package defines. */
export type TranslationKey = keyof typeof en | SharedTranslationKey;
