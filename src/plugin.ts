import { Plugin, WorkspaceLeaf, Notice, MarkdownView, TFile, Modal, type EventRef } from "obsidian";
import { EventEmitter } from "src/utils/EventEmitter";
import type { SelectionLocationInfo } from "src/ui/selectionHighlight";
import { SelectionManager } from "src/plugin/selectionManager";
import { EncryptionManager } from "src/plugin/encryptionManager";

import { WorkflowManager } from "src/plugin/workflowManager";
import { WorkspaceStateManager } from "src/core/workspaceStateManager";
import { ChatView, VIEW_TYPE_GEMINI_CHAT } from "src/ui/ChatView";
import { CryptView, CRYPT_VIEW_TYPE } from "src/ui/CryptView";
import { SettingsTab } from "src/ui/SettingsTab";
import {
  type GeminiHelperSettings,
  type WorkspaceState,
  type RagSetting,
  type RagState,
  type ModelType,
  type SlashCommand,
  DEFAULT_SETTINGS,
  DEFAULT_RAG_STATE,
  getDefaultModelForPlan,
} from "src/types";
import { initGeminiClient, resetGeminiClient, getGeminiClient } from "src/core/gemini";
import { initLangfuse, resetLangfuse } from "src/tracing/langfuse";
import { WorkflowSelectorModal } from "src/ui/components/workflow/WorkflowSelectorModal";
import {
  initFileSearchManager,
  resetFileSearchManager,
  getFileSearchManager,
  FILE_SEARCH_MULTIMODAL_EMBEDDING_MODEL,
  normalizeFileSearchStoreName,
  type SyncResult,
} from "src/core/fileSearch";
import {
  initEditHistoryManager,
  resetEditHistoryManager,
  getEditHistoryManager,
} from "src/core/editHistory";
import { EditHistoryModal } from "src/ui/components/EditHistoryModal";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import { formatError } from "src/utils/error";
import { DEFAULT_EDIT_HISTORY_SETTINGS, DEFAULT_LANGFUSE_SETTINGS, DEFAULT_WORKSPACE_FOLDER } from "src/types";
import { initLocale, t } from "src/i18n";
import { registerWorkflowCodeBlockProcessor } from "src/ui/workflowCodeBlock";
import { generateDashboardBase, generateDashboardWorkflow, listDashboardModels, rewriteDashboardText, runDashboardWorkflow } from "src/integrations/dashboardHubCapabilities";
import { REGISTER_RUNTIME_SKILL_EVENT, REQUEST_RUNTIME_SKILLS_EVENT, UNREGISTER_RUNTIME_SKILL_EVENT, registerRuntimeSkill, unregisterRuntimeSkill } from "src/core/runtimeSkills";
import { registerDiscussionHubIntegration } from "src/integrations/discussionHubCapabilities";

interface DashboardHubIntegration {
  protocolVersion: 1;
  id: string;
  name: string;
  listModels: () => Promise<Array<{ id: string; name: string; capabilities: { text: boolean; vaultRead: boolean; tools: boolean } }>>;
  getDefaultModel: () => Promise<string | null>;
  openChatWithDraft: (draft: string) => void | Promise<void>;
  askChatAboutSelection: (request: { text: string; sourcePath?: string }) => void | Promise<void>;
  runWorkflow?: (request: { workflowPath: string; outputVariable?: string; abortSignal?: AbortSignal }) => Promise<string>;
  generateBase?: (request: Parameters<typeof generateDashboardBase>[1]) => Promise<string>;
  rewriteText?: (request: Parameters<typeof rewriteDashboardText>[1]) => Promise<string>;
  generateWorkflow?: (request: Parameters<typeof generateDashboardWorkflow>[1]) => Promise<string>;
}

interface DashboardHubApi {
  registerIntegration: (integration: DashboardHubIntegration) => () => void;
  createDashboard: (requestedName?: string) => Promise<TFile | null>;
}

interface DashboardWorkspaceEvents {
  on: (name: "dashboard-hub:ready", callback: (hub: DashboardHubApi) => void) => EventRef;
  trigger: {
    (name: "dashboard-hub:register-integration", integration: DashboardHubIntegration): void;
    (name: "dashboard-hub:unregister-integration", request: { id: string; integration: DashboardHubIntegration }): void;
  };
}

function normalizeDeprecatedModelName(model: unknown): ModelType | null | undefined {
  if (model === null || model === undefined) return model;
  if (model === "gemini-3.1-flash-lite-preview") return "gemini-3.5-flash-lite";
  if (model === "gemini-3.1-flash-lite" || model === "gemini-2.5-flash-lite") return "gemini-3.5-flash-lite";
  if (model === "gemini-3-flash-preview") return "gemini-3.6-flash";
  return model as ModelType;
}

export class GeminiHelperPlugin extends Plugin {
  settings: GeminiHelperSettings = { ...DEFAULT_SETTINGS };
  settingsEmitter = new EventEmitter();
  private wsManager!: WorkspaceStateManager;
  private selectionManager!: SelectionManager;
  private encryptionManager!: EncryptionManager;
  private lastActiveMarkdownView: MarkdownView | null = null;
  private workflowMgr!: WorkflowManager;

  /** In-memory only — cleared on Obsidian restart */
  lastActiveChatId: string | null = null;

  // Delegate workspaceState to the manager
  get workspaceState(): WorkspaceState {
    return this.wsManager.workspaceState;
  }
  set workspaceState(value: WorkspaceState) {
    this.wsManager.workspaceState = value;
  }

  onload(): void {
    try {
      this.onloadImpl();
    } catch (e) {
      // Mobile has no readable console: surface startup failures via a
      // persistent Notice and a log file in the vault.
      // JavaScriptCore's error.stack omits the message, so include both explicitly.
      const msg = `Gemini Helper: onload failed: ${String(e)}\n${e instanceof Error ? e.stack ?? "" : ""}`;
      new Notice(msg, 0);
      void this.app.vault.adapter.write("gemini-helper-load-error.log", msg).catch(() => {});
      throw e;
    }
  }

  private onloadImpl(): void {
    // Initialize i18n locale
    initLocale();

    // Initialize selection manager
    this.selectionManager = new SelectionManager(this);

    // Initialize encryption manager
    this.encryptionManager = new EncryptionManager(this);

    // Initialize workflow manager
    this.workflowMgr = new WorkflowManager(this);

    // Workflow code block: render as Mermaid diagram (Reading mode + Live Preview)
    registerWorkflowCodeBlockProcessor(this);

    // Initialize workspace state manager
    this.wsManager = new WorkspaceStateManager(
      this.app,
      () => this.settings,
      () => this.saveSettings(),
      this.settingsEmitter,
      () => this.loadData()
    );

    // Handle migration data modified event
    this.settingsEmitter.on("migration-data-modified", (data: unknown) => {
      void (async () => {
        await this.saveData(data);
      })();
    });

    // Load settings and workspace state
    void this.loadSettings().then(async () => {
      // Apply workspace folder visibility (body class toggle)
      this.updateWorkspaceFolderVisibility();

      // Migrate from old settings format first (one-time)
      try {
        await this.wsManager.migrateFromOldSettings();
      } catch (e) {
        console.error("Gemini Helper: Failed to migrate old settings:", formatError(e));
      }
      try {
        await this.wsManager.loadWorkspaceState();
      } catch (e) {
        console.error("Gemini Helper: Failed to load workspace state:", formatError(e));
      }
      // Migrate slash commands (add default commands if missing)
      try {
        await this.migrateSlashCommands();
      } catch (e) {
        console.error("Gemini Helper: Failed to migrate slash commands:", formatError(e));
      }
      // Initialize clients if API key is set
      try {
        if (this.settings.googleApiKey) {
          this.initializeClients();
        }
      } catch (e) {
        console.error("Gemini Helper: Failed to initialize clients:", formatError(e));
      }
      // Register workflows as Obsidian commands for hotkey support
      try {
        this.registerWorkflowHotkeys();
      } catch (e) {
        console.error("Gemini Helper: Failed to register workflow hotkeys:", formatError(e));
      }
      // Register event listeners for workflow triggers
      try {
        this.registerWorkflowEventListeners();
      } catch (e) {
        console.error("Gemini Helper: Failed to register workflow event listeners:", formatError(e));
      }
      // Emit event to refresh UI after workspace state is loaded
      this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
      // Notify UI components that settings are ready (fixes race condition where
      // ChatView renders before loadSettings() completes, e.g. after BRAT hot-reload)
      this.settingsEmitter.emit("settings-updated", this.settings);
    }).catch((e) => {
      console.error("Gemini Helper: Failed to load settings:", formatError(e));
    });

    // Add settings tab
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerRuntimeSkillContributions();
    this.registerDashboardHubIntegration();
    registerDiscussionHubIntegration(this);
    this.notifyDashboardHubMigration();
    // Compatibility command for existing hotkeys; Dashboard Hub performs the
    // actual creation and remains the sole owner of .dashboard files.
    this.addCommand({
      id: "create-dashboard",
      name: t("command.createDashboard"),
      callback: () => { void this.createDashboard(); },
    });

    // Register chat view
    this.registerView(
      VIEW_TYPE_GEMINI_CHAT,
      (leaf) => new ChatView(leaf, this)
    );

    // Register crypt view (for encrypted files)
    this.registerView(
      CRYPT_VIEW_TYPE,
      (leaf) => new CryptView(leaf, this)
    );

    // Register .encrypted extension so Obsidian opens these files in CryptView
    this.registerExtensions(["encrypted"], CRYPT_VIEW_TYPE);

    // Register file menu (right-click) for encryption and edit history
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle(t("crypt.encryptFile"))
              .setIcon("lock")
              .onClick(async () => {
                await this.encryptFile(file);
              });
          });
          menu.addItem((item) => {
            item
              .setTitle(t("statusBar.snapshot"))
              .setIcon("camera")
              .onClick(async () => {
                await this.saveSnapshotForFile(file);
              });
          });
          menu.addItem((item) => {
            item
              .setTitle(t("statusBar.history"))
              .setIcon("history")
              .onClick(() => {
                new EditHistoryModal(this.app, file.path).open();
              });
          });
        }
      })
    );

    // Ensure chat view exists on layout ready
    this.app.workspace.onLayoutReady(() => {
      void this.ensureChatViewExists();
    });

    // Track active markdown view and capture selection when switching to chat
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view?.getViewType() === VIEW_TYPE_GEMINI_CHAT) {
          // Capture selection from the last active markdown view
          this.captureSelectionFromView(this.lastActiveMarkdownView);
          // Notify Chat component that it's now active
          this.settingsEmitter.emit("chat-activated");
        } else {
          // Leaving chat view - clear the highlight
          this.clearSelectionHighlight();
          if (leaf?.view instanceof MarkdownView) {
            // Track the last active markdown view
            this.lastActiveMarkdownView = leaf.view;
          }
        }
      })
    );

    // Add ribbon icon
    this.addRibbonIcon("message-square", "Open chat", () => {
      void this.activateChatView();
    });

    // Add command to open chat
    this.addCommand({
      id: "open-chat",
      name: "Open chat",
      callback: () => {
        void this.activateChatView();
      },
    });

    // Add command to toggle between chat and markdown view
    this.addCommand({
      id: "toggle-chat",
      name: "Toggle chat / editor",
      callback: () => {
        this.toggleChatView();
      },
    });

    // Add command to sync vault (semantic search)
    this.addCommand({
      id: "sync-vault-rag",
      name: "Sync vault for semantic search",
      callback: () => {
        void this.syncVaultForRAG();
      },
    });

    // Add command to show edit history
    this.addCommand({
      id: "show-edit-history",
      name: t("command.showEditHistory"),
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            new EditHistoryModal(this.app, activeFile.path).open();
          }
          return true;
        }
        return false;
      },
    });

    // Add command to restore previous version
    this.addCommand({
      id: "restore-previous-version",
      name: t("command.restorePreviousVersion"),
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            void this.restorePreviousVersion(activeFile.path);
          }
          return true;
        }
        return false;
      },
    });

    // Add command to encrypt current file
    this.addCommand({
      id: "encrypt-file",
      name: t("command.encryptFile"),
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            void this.encryptFile(activeFile);
          }
          return true;
        }
        return false;
      },
    });

    // Add command to decrypt current file
    this.addCommand({
      id: "decrypt-file",
      name: t("command.decryptFile"),
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && (activeFile.extension === "md" || activeFile.extension === "encrypted")) {
          if (!checking) {
            void this.decryptCurrentFile(activeFile);
          }
          return true;
        }
        return false;
      },
    });

    // Add command to run workflow
    this.addCommand({
      id: "run-workflow",
      name: t("command.runWorkflow"),
      callback: () => {
        new WorkflowSelectorModal(this.app, this, (filePath) => {
          void this.executeWorkflowFromHotkey(filePath);
        }).open();
      },
    });

    // Register file events for edit history
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md") {
          const historyManager = getEditHistoryManager();
          if (historyManager) {
            historyManager.handleFileRename(oldPath, file.path);
          }
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          const historyManager = getEditHistoryManager();
          if (historyManager) {
            historyManager.handleFileDelete(file.path);
          }
        }
      })
    );

    // Initialize snapshot when a file is opened (for edit history)
    // Also check if .md file is encrypted and redirect to CryptView
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          if (file.extension === "md") {
            const historyManager = getEditHistoryManager();
            if (historyManager) {
              void historyManager.initSnapshot(file.path);
            }

            // Check if file is encrypted and redirect to CryptView
            void this.checkAndOpenEncryptedFile(file);
          }
        }
      })
    );

  }

  /**
   * Save a snapshot for a specific file
   */
  private async saveSnapshotForFile(file: TFile): Promise<void> {
    const historyManager = getEditHistoryManager();
    if (!historyManager) {
      new Notice(t("editHistory.notInitialized"));
      return;
    }

    await historyManager.ensureSnapshot(file.path);
    const entry = historyManager.saveEdit({
      path: file.path,
      modifiedContent: await this.app.vault.read(file),
      source: "manual",
    });

    if (entry) {
      new Notice(t("statusBar.snapshotSaved"));
    } else {
      new Notice(t("editHistory.noChanges"));
    }
  }

  private async restorePreviousVersion(filePath: string): Promise<void> {
    const historyManager = getEditHistoryManager();
    if (!historyManager) {
      new Notice("Edit history manager not initialized");
      return;
    }

    const history = historyManager.getHistory(filePath);
    if (history.length === 0) {
      new Notice(t("editHistoryModal.noHistory"));
      return;
    }

    // Get the most recent entry and restore to before that change
    const lastEntry = history[history.length - 1];

    // Show confirmation modal
    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new Modal(this.app);
      modal.contentEl.createEl("p", { text: t("editHistoryModal.confirmRestore") });
      const buttonContainer = modal.contentEl.createDiv({ cls: "modal-button-container" });
      buttonContainer.createEl("button", { text: t("common.cancel") }).addEventListener("click", () => {
        modal.close();
        resolve(false);
      });
      buttonContainer.createEl("button", { text: t("common.confirm"), cls: "mod-warning" }).addEventListener("click", () => {
        modal.close();
        resolve(true);
      });
      modal.open();
    });

    if (confirmed) {
      await historyManager.restoreTo(filePath, lastEntry.id);
      const date = new Date(lastEntry.timestamp);
      const timeStr = date.toLocaleString();
      new Notice(t("editHistoryModal.restored", { timestamp: timeStr }));
    }
  }

  onunload(): void {
    this.clearSelectionHighlight();
    resetLangfuse();
    resetGeminiClient();
    resetFileSearchManager();
    resetEditHistoryManager();

    // Restore workspace folder visibility on unload
    this.settings.hideWorkspaceFolder = false;
    this.updateWorkspaceFolderVisibility();

    // Clean up workflow timers
    this.workflowMgr.cleanup();

  }

  async loadSettings() {
    const loaded = (await this.loadData() ?? {}) as Partial<GeminiHelperSettings>;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      googleApiKey: loaded.googleApiKey?.trim() ?? DEFAULT_SETTINGS.googleApiKey,
      // Deep copy arrays to avoid mutating DEFAULT_SETTINGS
      // Use loaded commands if present, otherwise use default commands
      slashCommands: loaded.slashCommands
        ? loaded.slashCommands.map((command: SlashCommand) => ({
          ...command,
          model: normalizeDeprecatedModelName(command.model),
        }))
        : [...DEFAULT_SETTINGS.slashCommands],
      // Deep copy MCP servers
      mcpServers: loaded.mcpServers
        ? [...loaded.mcpServers]
        : [],
      knowledgeSources: loaded.knowledgeSources
        ? loaded.knowledgeSources.slice(0, 1).map(source => ({ ...source, name: "OKF", type: "okf" as const }))
        : [],
      // Deep copy workflow arrays
      enabledWorkflowHotkeys: loaded.enabledWorkflowHotkeys
        ? [...loaded.enabledWorkflowHotkeys]
        : [],
      enabledWorkflowEventTriggers: loaded.enabledWorkflowEventTriggers
        ? [...loaded.enabledWorkflowEventTriggers]
        : [],
      // Deep merge editHistory settings
      editHistory: {
        ...DEFAULT_EDIT_HISTORY_SETTINGS,
        ...(loaded.editHistory ?? {}),
        diff: {
          ...DEFAULT_EDIT_HISTORY_SETTINGS.diff,
          ...(loaded.editHistory?.diff ?? {}),
        },
      },
      // Deep merge langfuse settings
      langfuse: {
        ...DEFAULT_LANGFUSE_SETTINGS,
        ...(loaded.langfuse ?? {}),
      },
    };
    this.settings.lastAIWorkflowModel = normalizeDeprecatedModelName(
      loaded.lastAIWorkflowModel
    ) ?? undefined;
    this.settings.lastTimelineAiModel = normalizeDeprecatedModelName(
      loaded.lastTimelineAiModel
    ) ?? undefined;
  }

  async saveSettings() {
    // Only save values that differ from defaults
    const dataToSave: Partial<GeminiHelperSettings> = {};
    for (const key of Object.keys(this.settings) as (keyof GeminiHelperSettings)[]) {
      const currentValue = this.settings[key];
      const defaultValue = DEFAULT_SETTINGS[key];
      // Use JSON.stringify for arrays/objects comparison
      const isDifferent = Array.isArray(currentValue) || (typeof currentValue === 'object' && currentValue !== null)
        ? JSON.stringify(currentValue) !== JSON.stringify(defaultValue)
        : currentValue !== defaultValue;
      if (isDifferent) {
        (dataToSave as Record<string, unknown>)[key] = currentValue;
      }
    }
    // Always persist workspaceFolder to survive migrations and plugin updates
    (dataToSave as Record<string, unknown>).workspaceFolder = this.settings.workspaceFolder;
    await this.saveData(dataToSave);
    this.settingsEmitter.emit("settings-updated", this.settings);

    // Always reinitialize clients to pick up any config changes
    this.initializeClients();

    // Re-register workflow hotkeys
    this.registerWorkflowHotkeys();
  }

  registerWorkflowHotkeys(): void {
    this.workflowMgr.registerHotkeys();
  }

  async executeWorkflowFromHotkey(filePath: string): Promise<void> {
    return this.workflowMgr.executeFromHotkey(filePath);
  }

  registerWorkflowEventListeners(): void {
    this.workflowMgr.registerEventListeners();
  }

  // ========================================
  // Workspace State Methods (delegated to WorkspaceStateManager)
  // ========================================

  getWorkspaceStateFilePath(): string {
    return this.wsManager.getWorkspaceStateFilePath();
  }

  async loadWorkspaceState(): Promise<void> {
    await this.wsManager.loadWorkspaceState();
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  async loadOrCreateWorkspaceState(): Promise<void> {
    return this.wsManager.loadOrCreateWorkspaceState();
  }

  async saveWorkspaceState(): Promise<void> {
    return this.wsManager.saveWorkspaceState();
  }

  /** Show or hide the workspace folder in the file explorer. */
  updateWorkspaceFolderVisibility(): void {
    const wsFolder = this.settings.workspaceFolder || DEFAULT_WORKSPACE_FOLDER;
    const hide = this.settings.hideWorkspaceFolder;
    // Find and toggle visibility on the exact matching nav-folder element
    activeDocument.querySelectorAll(`.nav-folder[data-path="${CSS.escape(wsFolder)}"]`).forEach((el) => {
      (el as HTMLElement).style.display = hide ? "none" : "";
    });
  }

  getSelectedRagSetting(): RagSetting | null {
    return this.wsManager.getSelectedRagSetting();
  }

  getRagSetting(name: string): RagSetting | null {
    return this.wsManager.getRagSetting(name);
  }

  getRagSettingNames(): string[] {
    return this.wsManager.getRagSettingNames();
  }

  async selectRagSetting(name: string | null): Promise<void> {
    return this.wsManager.selectRagSetting(name);
  }

  async selectWebSearchEnabled(enabled: boolean): Promise<void> {
    return this.wsManager.selectWebSearchEnabled(enabled);
  }

  async setAlwaysThinkPreference(family: "flash" | "flashLite", enabled: boolean): Promise<void> {
    return this.wsManager.setAlwaysThinkPreference(family, enabled);
  }

  async selectModel(model: ModelType): Promise<void> {
    return this.wsManager.selectModel(model);
  }

  getSelectedModel(): ModelType {
    return this.wsManager.getSelectedModel();
  }

  async createRagSetting(name: string, setting?: Partial<RagSetting>): Promise<void> {
    return this.wsManager.createRagSetting(name, setting);
  }

  async updateRagSetting(name: string, updates: Partial<RagSetting>): Promise<void> {
    return this.wsManager.updateRagSetting(name, updates);
  }

  async deleteRagSetting(name: string): Promise<void> {
    return this.wsManager.deleteRagSetting(name);
  }

  async renameRagSetting(oldName: string, newName: string): Promise<void> {
    return this.wsManager.renameRagSetting(oldName, newName);
  }

  async resetRagSettingSyncState(name: string): Promise<void> {
    return this.wsManager.resetRagSettingSyncState(name);
  }

  getVaultStoreName(): string {
    return this.wsManager.getVaultStoreName();
  }

  private syncFileSearchManagerWithSelectedRag(): void {
    this.wsManager.syncFileSearchManagerWithSelectedRag();
  }

  // Migrate from old settings format (plugin-specific parts)
  private async migrateSlashCommands(): Promise<void> {
    // Add default infographic command if not present
    const hasInfographicCommand = this.settings.slashCommands.some(
      (cmd) => cmd.name === "infographic"
    );
    if (!hasInfographicCommand) {
      this.settings.slashCommands.push({
        id: "cmd_infographic_default",
        name: "infographic",
        promptTemplate: "Convert the following content into an HTML infographic. Output the HTML directly in your response, do not create a note:\n\n{selection}",
        model: null,
        description: "Generate HTML infographic from selection or active note",
        searchSetting: null,
      });
      await this.saveSettings();
    }
  }

  private initializeClients() {
    if (this.settings.googleApiKey) {
      initGeminiClient(this.settings.googleApiKey, getDefaultModelForPlan(this.settings.apiPlan));
      initFileSearchManager(this.settings.googleApiKey, this.app);
    } else {
      resetGeminiClient();
      resetFileSearchManager();
    }
    initLangfuse(this.settings.langfuse);

    // Initialize edit history manager
    const editHistorySettings = this.settings.editHistory || DEFAULT_EDIT_HISTORY_SETTINGS;
    initEditHistoryManager(this.app, editHistorySettings);

    // Sync FileSearchManager with selected RAG setting
    this.syncFileSearchManagerWithSelectedRag();
  }

  private async ensureChatViewExists() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GEMINI_CHAT);
    if (leaves.length === 0) {
      let leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        leaf = this.app.workspace.getRightLeaf(true);
      }
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_GEMINI_CHAT,
          active: false,
        });
      }
    }
  }

  /** Delegate dashboard creation to the standalone Dashboard Hub plugin. */
  async createDashboard(requestedName = "Dashboard"): Promise<TFile | null> {
    const app = this.app as typeof this.app & { plugins?: { plugins?: Record<string, unknown> } };
    const dashboardHub = app.plugins?.plugins?.["dashboard-hub"] as DashboardHubApi | undefined;
    if (!dashboardHub?.createDashboard) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- Dashboard Hub is a product name.
      new Notice("Install and enable Dashboard Hub to create dashboards.");
      return null;
    }
    return dashboardHub.createDashboard(requestedName);
  }

  private notifyDashboardHubMigration(): void {
    this.app.workspace.onLayoutReady(() => {
      const app = this.app as typeof this.app & {
        plugins?: {
          plugins?: Record<string, unknown>;
          enabledPlugins?: { has: (id: string) => boolean };
        };
      };
      if (app.plugins?.plugins?.["dashboard-hub"] || app.plugins?.enabledPlugins?.has("dashboard-hub")) return;
      if (!app.vault.getFiles().some((file) => file.extension === "dashboard")) return;

      const storageKey = `dashboard-hub:migration-notice:${app.vault.getName()}`;
      try {
        if (window.localStorage.getItem(storageKey)) return;
        window.localStorage.setItem(storageKey, "shown");
      } catch {
        const shared = globalThis as typeof globalThis & { __dashboardHubMigrationNoticeShown?: boolean };
        if (shared.__dashboardHubMigrationNoticeShown) return;
        shared.__dashboardHubMigrationNoticeShown = true;
      }
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- Dashboard Hub is a product name.
      new Notice("Existing .dashboard files now require the separate Dashboard Hub plugin. Install and enable Dashboard Hub to open them.", 15000);
    });
  }

  private registerDashboardHubIntegration(): void {
    const integration: DashboardHubIntegration = {
      protocolVersion: 1,
      id: this.manifest.id,
      name: this.manifest.name,
      listModels: () => Promise.resolve(listDashboardModels(this)),
      getDefaultModel: () => Promise.resolve(this.getSelectedModel()),
      openChatWithDraft: (draft) => this.openChatWithDraft(draft),
      askChatAboutSelection: (request) => this.askChatAboutSelection(request),
      runWorkflow: (request) => runDashboardWorkflow(this, request),
      generateBase: (request) => generateDashboardBase(this, request),
      rewriteText: (request) => rewriteDashboardText(this, request),
      generateWorkflow: (request) => generateDashboardWorkflow(this, request),
    };
    const workspace = this.app.workspace as unknown as DashboardWorkspaceEvents;
    this.registerEvent(workspace.on("dashboard-hub:ready", (hub) => {
      hub.registerIntegration(integration);
    }));
    workspace.trigger("dashboard-hub:register-integration", integration);
    this.register(() => {
      workspace.trigger("dashboard-hub:unregister-integration", { id: integration.id, integration });
    });
  }

  private registerRuntimeSkillContributions(): void {
    const workspace = this.app.workspace as unknown as {
      on: (name: string, callback: (value: unknown) => void) => EventRef;
      trigger: (name: string) => void;
    };
    this.registerEvent(workspace.on(REGISTER_RUNTIME_SKILL_EVENT, (value) => {
      if (registerRuntimeSkill(value)) this.settingsEmitter.emit("skills-changed");
    }));
    this.registerEvent(workspace.on(UNREGISTER_RUNTIME_SKILL_EVENT, (value) => {
      if (unregisterRuntimeSkill(value)) this.settingsEmitter.emit("skills-changed");
    }));
    workspace.trigger(REQUEST_RUNTIME_SKILLS_EVENT);
  }

  async activateChatView(): Promise<void> {
    // Capture selection before switching focus
    this.captureSelection();

    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_GEMINI_CHAT);
    if (existingLeaves.length > 0) {
      leaf = existingLeaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_GEMINI_CHAT,
          active: true,
        });
      }
    }

    if (leaf) {
      void workspace.revealLeaf(leaf);
    }
  }

  async askChatAboutSelection(selection: { text: string; sourcePath?: string }): Promise<void> {
    const text = selection.text.trim();
    if (!text) return;

    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_GEMINI_CHAT)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_GEMINI_CHAT,
          active: true,
        });
      }
    }
    if (!leaf) return;

    await workspace.revealLeaf(leaf);
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
      const view = leaf.view instanceof ChatView ? leaf.view : null;
      if (view) {
        view.askSelection({ text, sourcePath: selection.sourcePath });
        this.settingsEmitter.emit("chat-activated");
        return;
      }
    }
  }

  async openChatWithDraft(content: string): Promise<void> {
    const draft = content.trim();
    if (!draft) return;

    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_GEMINI_CHAT)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_GEMINI_CHAT,
          active: true,
        });
      }
    }
    if (!leaf) return;

    await workspace.revealLeaf(leaf);
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
      const view = leaf.view instanceof ChatView ? leaf.view : null;
      if (view) {
        view.setChatDraft(draft);
        this.settingsEmitter.emit("chat-activated");
        return;
      }
    }
  }

  // Toggle between chat view and last active markdown view
  private toggleChatView(): void {
    const chatLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GEMINI_CHAT);
    const activeChatView = this.app.workspace.getActiveViewOfType(ChatView);

    if (activeChatView) {
      // Currently in chat, go back to last markdown view
      if (this.lastActiveMarkdownView?.leaf) {
        this.clearSelectionHighlight();
        this.app.workspace.setActiveLeaf(this.lastActiveMarkdownView.leaf, { focus: true });
      }
    } else {
      // Not in chat, capture selection and open/activate chat
      this.captureSelectionFromView(this.lastActiveMarkdownView);
      if (chatLeaves.length > 0) {
        this.app.workspace.setActiveLeaf(chatLeaves[0], { focus: true });
        // Notify Chat component that it's now active
        this.settingsEmitter.emit("chat-activated");
      } else {
        void this.activateChatView();
      }
    }
  }

  // Capture selection from a specific markdown view
  private captureSelectionFromView(view: MarkdownView | null): void {
    this.selectionManager.captureSelectionFromView(view);
  }

  captureSelection(): void {
    this.selectionManager.captureSelection();
  }

  clearSelectionHighlight(): void {
    this.selectionManager.clearSelectionHighlight();
  }

  getLastSelection(): string {
    return this.selectionManager.getLastSelection();
  }

  getSelectionLocation(): SelectionLocationInfo | null {
    return this.selectionManager.getSelectionLocation();
  }

  clearLastSelection(): void {
    this.selectionManager.clearLastSelection();
  }

  async syncVaultForRAG(
    ragSettingName?: string,
    onProgress?: (
      current: number,
      total: number,
      fileName: string,
      action: "upload" | "skip" | "delete"
    ) => void
  ): Promise<SyncResult | null> {
    const fileSearchManager = getFileSearchManager();

    if (!fileSearchManager) {
      new Notice("File search manager not initialized. Please set API key.");
      return null;
    }

    if (!this.settings.ragEnabled) {
      new Notice("Semantic search is not enabled. Enable it in settings first.");
      return null;
    }

    // Determine which RAG setting to sync
    const settingName = ragSettingName || this.workspaceState.selectedRagSetting;
    if (!settingName) {
      new Notice("No semantic search setting selected. Please select or create a semantic search setting first.");
      return null;
    }

    const ragSetting = this.workspaceState.ragSettings[settingName];
    if (!ragSetting) {
      new Notice(`Semantic search setting "${settingName}" not found.`);
      return null;
    }

    // Ensure a new setting doesn't inherit a previous store
    if (!ragSetting.storeId) {
      fileSearchManager.setStoreName(null);
    }

    // External stores cannot be synced
    if (ragSetting.isExternal) {
      new Notice("Cannot sync external semantic search store. Only internal stores can be synced.");
      return null;
    }

    try {
      // Get or create store with setting-specific name
      const storeName = ragSetting.storeName || `${this.getVaultStoreName()}-${settingName}`;
      let currentRagSetting = ragSetting;
      let currentSyncState = { files: currentRagSetting.files, lastFullSync: currentRagSetting.lastFullSync };

      if (currentRagSetting.storeId && currentRagSetting.embeddingModel !== FILE_SEARCH_MULTIMODAL_EMBEDDING_MODEL) {
        const recreate = await new ConfirmModal(
          this.app,
          "This semantic search store was created before multimodal File Search support, or its embedding model is unknown. Recreate it with gemini-embedding-2 to enable image RAG? Choose cancel to keep using the existing store for this sync.",
          "Recreate store",
          "Use existing store"
        ).openAndWait();

        if (recreate) {
          try {
            await fileSearchManager.deleteStore(currentRagSetting.storeId);
          } catch (error) {
            console.warn("Gemini Helper: Failed to delete old File Search store during recreation:", formatError(error));
            new Notice("Could not delete the old semantic search store. Creating a new store instead.");
          }
          fileSearchManager.setStoreName(null);
          currentRagSetting = {
            ...currentRagSetting,
            storeId: null,
            storeName: null,
            embeddingModel: null,
            files: {},
            lastFullSync: null,
          };
          currentSyncState = { files: {}, lastFullSync: null };
          new Notice("Recreating semantic search store with multimodal embeddings...");
        } else {
          fileSearchManager.setStoreName(currentRagSetting.storeId);
        }
      }

      const storeId = currentRagSetting.storeId
        ? normalizeFileSearchStoreName(currentRagSetting.storeId)
        : await fileSearchManager.getOrCreateStore(storeName);
      if (!storeId) {
        throw new Error("Invalid File Search Store ID");
      }
      fileSearchManager.setStoreName(storeId);

      // If store ID changed, clear files to force re-upload
      if (currentRagSetting.storeId && currentRagSetting.storeId !== storeId) {
        // Store changed, need to re-upload all files
        currentSyncState = { files: {}, lastFullSync: null };
        new Notice("Store changed. Re-uploading all files...");
      }

      // Persist the store before uploading. A large sync can be interrupted or
      // partially fail; the already-created remote store must remain usable and
      // must be reused on the next sync instead of becoming orphaned.
      const configuredRagSetting: RagSetting = {
        ...currentRagSetting,
        storeId,
        storeName,
        embeddingModel: currentRagSetting.embeddingModel
          ?? FILE_SEARCH_MULTIMODAL_EMBEDDING_MODEL,
      };
      this.workspaceState.ragSettings[settingName] = configuredRagSetting;
      currentRagSetting = configuredRagSetting;
      await this.saveWorkspaceState();
      this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);

      // Smart sync with checksum-based diff detection
      const result = await fileSearchManager.smartSync(
        currentSyncState,
        {
          includeFolders: ragSetting.targetFolders,
          excludePatterns: ragSetting.excludePatterns,
        },
        (current, total, fileName, action) => {
          onProgress?.(current, total, fileName, action);
        }
      );

      // Save store ID and sync state
      const finalStoreId = fileSearchManager.getStoreName();
      this.workspaceState.ragSettings[settingName] = {
        ...currentRagSetting,
        storeId: finalStoreId,
        storeName: storeName,
        embeddingModel: currentRagSetting.embeddingModel,
        files: result.newSyncState.files,
        lastFullSync: result.newSyncState.lastFullSync,
      };
      await this.saveWorkspaceState();
      this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);

      // Log summary
      const summary = `Sync completed: ${result.uploaded.length} uploaded, ${result.skipped.length} skipped, ${result.deleted.length} deleted, ${result.errors.length} errors`;
      new Notice(summary);

      return result;
    } catch (error) {
      new Notice(`Sync failed: ${formatError(error)}`);
      return null;
    }
  }

  // Delete RAG store from server
  async deleteRagStore(ragSettingName: string): Promise<void> {
    const ragSetting = this.workspaceState.ragSettings[ragSettingName];
    if (!ragSetting) {
      throw new Error(`Semantic search setting "${ragSettingName}" not found`);
    }

    if (!ragSetting.storeId) {
      throw new Error("No store ID to delete");
    }

    // External stores should not be deleted
    if (ragSetting.isExternal) {
      throw new Error("Cannot delete external store");
    }

    const fileSearchManager = getFileSearchManager();
    if (!fileSearchManager) {
      throw new Error("File Search Manager not initialized");
    }

    await fileSearchManager.deleteStore(ragSetting.storeId);

    // Clear the setting's store info
    this.workspaceState.ragSettings[ragSettingName] = {
      ...ragSetting,
      storeId: null,
      storeName: null,
      files: {},
      lastFullSync: null,
    };

    await this.saveWorkspaceState();
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Legacy compatibility: ragState getter
  get ragState(): RagState {
    const selected = this.getSelectedRagSetting();
    if (!selected) {
      return { ...DEFAULT_RAG_STATE };
    }
    // For external stores, use first storeId from storeIds array
    const storeId = selected.isExternal
      ? (selected.storeIds[0] || null)
      : selected.storeId;
    return {
      storeId,
      storeName: selected.storeName,
      files: selected.files,
      lastFullSync: selected.lastFullSync,
      includeFolders: selected.targetFolders,
      excludePatterns: selected.excludePatterns,
    };
  }

  // Get all store IDs for the selected RAG setting (for external stores with multiple IDs)
  getSelectedStoreIds(): string[] {
    const selected = this.getSelectedRagSetting();
    return this.getStoreIdsForRagSetting(selected);
  }

  getStoreIdsForRagSetting(ragSetting: RagSetting | null | undefined): string[] {
    const selected = ragSetting;
    if (!selected) return [];
    if (selected.isExternal) {
      return selected.storeIds
        .map((id) => normalizeFileSearchStoreName(id))
        .filter((id): id is string => !!id);
    }
    const storeId = normalizeFileSearchStoreName(selected.storeId);
    return storeId ? [storeId] : [];
  }

  // Get slash commands for workflow
  getSlashCommands(): SlashCommand[] {
    return this.settings.slashCommands;
  }

  // Execute a slash command for workflow
  async executeSlashCommand(
    commandIdOrName: string,
    options?: {
      value?: string;
      contentPath?: string;
      selection?: { path: string; start: unknown; end: unknown };
      chatId?: string;
    }
  ): Promise<{ response: string; chatId: string }> {
    // Find the command
    const command = this.settings.slashCommands.find(
      (cmd) => cmd.id === commandIdOrName || cmd.name === commandIdOrName
    );

    if (!command) {
      throw new Error(`Slash command not found: ${commandIdOrName}`);
    }

    // Get the content to use
    let content = "";
    if (options?.value) {
      content = options.value;
    } else if (options?.contentPath) {
      // Read content from file
      const file = this.app.vault.getAbstractFileByPath(options.contentPath);
      if (file instanceof TFile) {
        content = await this.app.vault.read(file);
      }
    } else if (options?.selection) {
      // Read content from selection
      const selectionPath = options.selection.path;
      const file = this.app.vault.getAbstractFileByPath(selectionPath);
      if (file instanceof TFile) {
        const fileContent = await this.app.vault.read(file);
        // For now, just use the whole file content
        // TODO: Extract selection range
        content = fileContent;
      }
    }

    // Replace {selection} placeholder in template
    const prompt = command.promptTemplate.replace(/\{selection\}/g, content);

    // Get the Gemini client
    const client = getGeminiClient();
    if (!client) {
      throw new Error("Gemini client not initialized");
    }

    // Set model if specified
    if (command.model) {
      client.setModel(command.model);
    }

    // Send message
    const response = await client.chat(
      [{ role: "user", content: prompt, timestamp: Date.now() }],
      this.settings.systemPrompt || undefined
    );

    // Generate or use existing chatId
    const chatId = options?.chatId || `workflow-${Date.now()}`;

    return { response, chatId };
  }

  // ========================================
  // Encryption Methods
  // ========================================

  /**
   * Encrypt a file
   */
  async encryptFile(file: TFile): Promise<void> {
    return this.encryptionManager.encryptFile(file);
  }

  private async checkAndOpenEncryptedFile(file: TFile): Promise<void> {
    return this.encryptionManager.checkAndOpenEncryptedFile(file);
  }

  async decryptCurrentFile(file: TFile): Promise<void> {
    return this.encryptionManager.decryptCurrentFile(file);
  }
}
