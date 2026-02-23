import { Plugin, WorkspaceLeaf, Notice, MarkdownView, TFile, Modal, App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { EventEmitter } from "src/utils/EventEmitter";
import {
  selectionHighlightField,
  setSelectionHighlight,
  type SelectionHighlightInfo,
  type SelectionLocationInfo,
} from "src/ui/selectionHighlight";
import { matchFilePattern } from "src/utils/globMatcher";
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
  type ObsidianEventType,
  type WorkflowEventTrigger,
  type McpAppInfo,
  DEFAULT_SETTINGS,
  DEFAULT_RAG_STATE,
  getDefaultModelForPlan,
} from "src/types";
import { initGeminiClient, resetGeminiClient, getGeminiClient } from "src/core/gemini";
import { WorkflowExecutor } from "src/workflow/executor";
import { parseWorkflowFromMarkdown } from "src/workflow/parser";
import type { WorkflowInput } from "src/workflow/types";
import { promptForDialog } from "src/ui/components/workflow/DialogPromptModal";
import { promptForConfirmation } from "src/ui/components/workflow/EditConfirmationModal";
import { promptForFile, promptForAnyFile, promptForNewFilePath } from "src/ui/components/workflow/FilePromptModal";
import { promptForSelection } from "src/ui/components/workflow/SelectionPromptModal";
import { promptForValue } from "src/ui/components/workflow/ValuePromptModal";
import { WorkflowSelectorModal } from "src/ui/components/workflow/WorkflowSelectorModal";
import { WorkflowExecutionModal } from "src/ui/components/workflow/WorkflowExecutionModal";
import { showMcpApp } from "src/ui/components/workflow/McpAppModal";
import {
  initFileSearchManager,
  resetFileSearchManager,
  getFileSearchManager,
  type SyncResult,
} from "src/core/fileSearch";
import { initCliProviderManager } from "src/core/cliProvider";
import {
  initEditHistoryManager,
  resetEditHistoryManager,
  getEditHistoryManager,
} from "src/core/editHistory";
import { EditHistoryModal } from "src/ui/components/EditHistoryModal";
import { formatError } from "src/utils/error";
import { DEFAULT_CLI_CONFIG, DEFAULT_EDIT_HISTORY_SETTINGS, hasVerifiedCli } from "src/types";
import { initLocale, t } from "src/i18n";
import { isEncryptedFile, encryptFileContent, decryptFileContent } from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";

export class GeminiHelperPlugin extends Plugin {
  settings: GeminiHelperSettings = { ...DEFAULT_SETTINGS };
  settingsEmitter = new EventEmitter();
  private wsManager!: WorkspaceStateManager;
  private lastSelection = "";
  private selectionHighlight: SelectionHighlightInfo | null = null;
  private selectionLocation: SelectionLocationInfo | null = null;
  private lastActiveMarkdownView: MarkdownView | null = null;
  private registeredWorkflowPaths: string[] = [];
  private eventListenersRegistered = false;
  // Event loop prevention: tracks files being modified by workflows
  private workflowModifiedFiles = new Set<string>();
  // Debounce timers for modify events (per file)
  private modifyDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly MODIFY_DEBOUNCE_MS = 5000; // 5 seconds debounce for modify events

  // Delegate workspaceState to the manager
  get workspaceState(): WorkspaceState {
    return this.wsManager.workspaceState;
  }
  set workspaceState(value: WorkspaceState) {
    this.wsManager.workspaceState = value;
  }

  onload(): void {
    // Initialize i18n locale
    initLocale();

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
        // Update in-memory settings from migrated data before saving
        const migratedData = data as Record<string, unknown>;
        if (migratedData.workspaceFolder !== undefined) {
          this.settings.workspaceFolder = migratedData.workspaceFolder as string;
        }
        await this.saveData(data);
      })();
    });

    // Load settings and workspace state
    void this.loadSettings().then(async () => {
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
      // Initialize clients if API key is set or any CLI is verified
      try {
        const cliConfig = this.settings.cliConfig || DEFAULT_CLI_CONFIG;
        if (this.settings.googleApiKey || hasVerifiedCli(cliConfig)) {
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
    }).catch((e) => {
      console.error("Gemini Helper: Failed to load settings:", formatError(e));
    });

    // Add settings tab
    this.addSettingTab(new SettingsTab(this.app, this));

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
        new WorkflowSelectorModal(this.app, this, (filePath, workflowName) => {
          void this.executeWorkflowFromHotkey(filePath, workflowName);
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
    // Also check if file is encrypted and open in CryptView
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
          } else if (file.extension === "encrypted") {
            // .encrypted files are always encrypted - open in CryptView
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

  /**
   * Save a snapshot for the active file
   */
  private async saveSnapshotForActiveFile(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice(t("editHistory.noActiveFile"));
      return;
    }
    await this.saveSnapshotForFile(activeFile);
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
    resetGeminiClient();
    resetFileSearchManager();
    resetEditHistoryManager();

    // Clean up debounce timers
    for (const timer of this.modifyDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.modifyDebounceTimers.clear();
    this.workflowModifiedFiles.clear();
  }

  async loadSettings() {
    const loaded = await this.loadData() ?? {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      // Deep copy arrays to avoid mutating DEFAULT_SETTINGS
      // Use loaded commands if present, otherwise use default commands
      slashCommands: loaded.slashCommands
        ? [...loaded.slashCommands]
        : [...DEFAULT_SETTINGS.slashCommands],
      // Deep copy MCP servers
      mcpServers: loaded.mcpServers
        ? [...loaded.mcpServers]
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
    };
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
    await this.saveData(dataToSave);
    this.settingsEmitter.emit("settings-updated", this.settings);

    // Always reinitialize clients to pick up any config changes
    this.initializeClients();

    // Re-register workflow hotkeys
    this.registerWorkflowHotkeys();
  }

  /**
   * Register workflows as Obsidian commands for hotkey support.
   * Note: Obsidian doesn't support unregistering commands, so once registered,
   * commands remain until plugin reload. We track all registered identifiers to avoid
   * duplicate registration errors.
   */
  registerWorkflowHotkeys(): void {
    for (const workflowId of this.settings.enabledWorkflowHotkeys) {
      // Skip if already registered in this session (prevents duplicate registration error)
      if (this.registeredWorkflowPaths.includes(workflowId)) {
        continue;
      }

      // Parse path#name format
      const hashIndex = workflowId.lastIndexOf("#");
      if (hashIndex === -1) continue;

      const filePath = workflowId.substring(0, hashIndex);
      const workflowName = workflowId.substring(hashIndex + 1);

      const obsidianCommandId = `workflow-${workflowId.replace(/[^a-zA-Z0-9]/g, "-")}`;

      // Register new command
      this.addCommand({
        id: obsidianCommandId,
        name: `Workflow: ${workflowName}`,
        callback: () => {
          void this.executeWorkflowFromHotkey(filePath, workflowName);
        },
      });

      // Track as registered (never re-register in this session)
      this.registeredWorkflowPaths.push(workflowId);
    }
  }

  /**
   * Prompt for password to decrypt encrypted files
   */
  private promptForPassword(): Promise<string | null> {
    return new Promise((resolve) => {
      class PasswordModal extends Modal {
        onOpen(): void {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.addClass("gemini-helper-password-modal");

          contentEl.createEl("h3", { text: t("crypt.enterPassword") });
          contentEl.createEl("p", { text: t("crypt.enterPasswordDesc") });

          const inputEl = contentEl.createEl("input", {
            type: "password",
            placeholder: t("crypt.passwordPlaceholder"),
            cls: "gemini-helper-password-input",
          });

          const buttonContainer = contentEl.createDiv({ cls: "gemini-helper-button-container" });

          const cancelBtn = buttonContainer.createEl("button", { text: t("common.cancel") });
          cancelBtn.addEventListener("click", () => {
            resolve(null);
            this.close();
          });

          const unlockBtn = buttonContainer.createEl("button", { text: t("crypt.unlock"), cls: "mod-cta" });
          unlockBtn.addEventListener("click", () => {
            const password = inputEl.value;
            if (password) {
              resolve(password);
              this.close();
            }
          });

          inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && inputEl.value) {
              resolve(inputEl.value);
              this.close();
            }
          });

          setTimeout(() => inputEl.focus(), 50);
        }

        onClose(): void {
          this.contentEl.empty();
        }
      }

      const modal = new PasswordModal(this.app);
      modal.open();
    });
  }

  /**
   * Execute workflow from hotkey
   */
  async executeWorkflowFromHotkey(filePath: string, workflowName: string): Promise<void> {
    // Capture selection before execution
    this.captureSelection();
    const selection = this.lastSelection;
    const selectionLocation = this.selectionLocation;

    // Get active note content
    let content = "";
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file) {
      content = await this.app.vault.read(activeView.file);
    }

    // Get the workflow file
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      new Notice(`Workflow file not found: ${filePath}`);
      return;
    }

    // Create abort controller for stopping workflow
    const abortController = new AbortController();
    let executionModal: WorkflowExecutionModal | null = null;

    try {
      const fileContent = await this.app.vault.read(file);
      const workflow = parseWorkflowFromMarkdown(fileContent, workflowName);

      // Check if progress modal should be shown (default: true)
      const showProgress = workflow.options?.showProgress !== false;

      const executor = new WorkflowExecutor(this.app, this);

      const input: WorkflowInput = {
        variables: new Map(),
      };

      // Set hotkey mode internal variables (used by prompt-file and prompt-selection nodes)
      // The actual "file", "selection", "selectionInfo" variables are set by prompt nodes
      input.variables.set("__hotkeyContent__", content);
      input.variables.set("__hotkeySelection__", selection);

      if (activeView?.file) {
        input.variables.set("__hotkeyActiveFile__", JSON.stringify({
          path: activeView.file.path,
          basename: activeView.file.basename,
          name: activeView.file.name,
          extension: activeView.file.extension,
        }));
      }

      if (selectionLocation) {
        input.variables.set("__hotkeySelectionInfo__", JSON.stringify({
          filePath: selectionLocation.filePath,
          startLine: selectionLocation.startLine,
          endLine: selectionLocation.endLine,
          start: selectionLocation.start,
          end: selectionLocation.end,
        }));
      }

      // Create execution modal to show progress (if enabled)
      if (showProgress) {
        executionModal = new WorkflowExecutionModal(
          this.app,
          workflow,
          workflowName,
          abortController,
          () => {
            // onAbort callback - nothing special needed for hotkey mode
          }
        );
        executionModal.open();
      }

      // Prompt callbacks for hotkey execution
      const promptCallbacks = {
        promptForFile: (defaultPath?: string) =>
          promptForFile(this.app, defaultPath || t("workflowModal.selectFile")),
        promptForSelection: () =>
          promptForSelection(this.app, t("workflowModal.selectText")),
        promptForValue: (prompt: string, defaultValue?: string, multiline?: boolean) =>
          promptForValue(this.app, prompt, defaultValue || "", multiline || false),
        promptForAnyFile: (extensions?: string[], defaultPath?: string) =>
          promptForAnyFile(this.app, extensions, defaultPath || "Select a file"),
        promptForNewFilePath: (extensions?: string[], defaultPath?: string) =>
          promptForNewFilePath(this.app, extensions, defaultPath),
        promptForConfirmation: (filePath: string, content: string, mode: string) =>
          promptForConfirmation(this.app, filePath, content, mode),
        promptForDialog: (title: string, message: string, options: string[], multiSelect: boolean, button1: string, button2?: string, markdown?: boolean, inputTitle?: string, defaults?: { input?: string; selected?: string[] }, multiline?: boolean) =>
          promptForDialog(this.app, title, message, options, multiSelect, button1, button2, markdown, inputTitle, defaults, multiline),
        openFile: async (notePath: string) => {
          const noteFile = this.app.vault.getAbstractFileByPath(notePath);
          if (noteFile instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(noteFile);
          }
        },
        promptForPassword: async () => {
          // Try cached password first
          const cached = cryptoCache.getPassword();
          if (cached) return cached;
          // Prompt for password
          return this.promptForPassword();
        },
        showMcpApp: async (mcpApp: McpAppInfo) => {
          // Only show MCP App UI if execution modal is displayed
          if (executionModal) {
            await showMcpApp(this.app, mcpApp);
          }
        },
      };

      await executor.execute(
        workflow,
        input,
        (log) => {
          // Update execution modal with progress
          executionModal?.updateFromLog(log);
        },
        {
          workflowPath: filePath,
          workflowName: workflowName,
          recordHistory: true,
        },
        promptCallbacks
      );

      // Mark as completed
      if (executionModal) {
        executionModal.setComplete(true);
      } else {
        new Notice(t("workflow.completedSuccessfully"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (executionModal) {
        executionModal.setComplete(false);
      }
      new Notice(`Workflow failed: ${message}`);
    }
  }

  /**
   * Register event listeners for workflow triggers.
   * Unlike hotkeys, event listeners can be dynamically updated.
   */
  registerWorkflowEventListeners(): void {
    // Only register once to avoid duplicate listeners
    if (this.eventListenersRegistered) {
      return;
    }
    this.eventListenersRegistered = true;

    // File created
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          void this.handleWorkflowEvent("create", file.path, { file });
        }
      })
    );

    // File modified
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          void this.handleWorkflowEvent("modify", file.path, { file });
        }
      })
    );

    // File deleted
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          void this.handleWorkflowEvent("delete", file.path, { file });
        }
      })
    );

    // File renamed
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          void this.handleWorkflowEvent("rename", file.path, { file, oldPath });
        }
      })
    );

    // File opened
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          void (async () => {
            // Skip encrypted files - they will be handled by CryptView
            try {
              const content = await this.app.vault.read(file);
              if (isEncryptedFile(content)) {
                return;
              }
            } catch {
              // Ignore read errors
            }
            void this.handleWorkflowEvent("file-open", file.path, { file });
          })();
        }
      })
    );
  }

  /**
   * Handle a workflow event trigger.
   * Includes event loop prevention and debouncing for modify events.
   */
  private async handleWorkflowEvent(
    eventType: ObsidianEventType,
    filePath: string,
    eventData: { file?: TFile; oldPath?: string }
  ): Promise<void> {
    const triggers = this.settings.enabledWorkflowEventTriggers;
    if (!triggers || triggers.length === 0) {
      return;
    }

    // Event loop prevention: skip if this file was recently modified by a workflow
    if (this.workflowModifiedFiles.has(filePath)) {
      return;
    }

    // For modify events, use debouncing to avoid triggering on every autosave
    if (eventType === "modify") {
      // Clear existing timer for this file
      const existingTimer = this.modifyDebounceTimers.get(filePath);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new debounced handler
      const timer = setTimeout(() => {
        this.modifyDebounceTimers.delete(filePath);
        void this.executeMatchingWorkflows(eventType, filePath, eventData, triggers);
      }, GeminiHelperPlugin.MODIFY_DEBOUNCE_MS);

      this.modifyDebounceTimers.set(filePath, timer);
      return;
    }

    // For other events, execute immediately
    await this.executeMatchingWorkflows(eventType, filePath, eventData, triggers);
  }

  /**
   * Find and execute all matching workflows for an event.
   * Uses Promise.allSettled for proper error handling.
   */
  private async executeMatchingWorkflows(
    eventType: ObsidianEventType,
    filePath: string,
    eventData: { file?: TFile; oldPath?: string },
    triggers: WorkflowEventTrigger[]
  ): Promise<void> {
    // Find all matching triggers for this event
    const matchingTriggers = triggers.filter((trigger) => {
      // Check if this trigger responds to this event type
      if (!trigger.events.includes(eventType)) {
        return false;
      }

      // Check file pattern if specified
      if (trigger.filePattern) {
        if (!matchFilePattern(trigger.filePattern, filePath)) {
          return false;
        }
      }

      return true;
    });

    if (matchingTriggers.length === 0) {
      return;
    }

    // Execute all matching workflows and collect results
    const results = await Promise.allSettled(
      matchingTriggers.map((trigger) =>
        this.executeWorkflowFromEvent(trigger, eventType, filePath, eventData)
      )
    );

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const trigger = matchingTriggers[index];
        const workflowName = trigger.workflowId.split("#").pop() || trigger.workflowId;
        console.error(
          `Workflow (${workflowName}) triggered by ${eventType} failed:`,
          formatError(result.reason)
        );
      }
    });
  }

  /**
   * Execute workflow from event trigger.
   * Includes event loop prevention by tracking modified files.
   */
  private async executeWorkflowFromEvent(
    trigger: WorkflowEventTrigger,
    eventType: ObsidianEventType,
    filePath: string,
    eventData: { file?: TFile; oldPath?: string }
  ): Promise<void> {
    // Parse path#name format
    const hashIndex = trigger.workflowId.lastIndexOf("#");
    if (hashIndex === -1) return;

    const workflowFilePath = trigger.workflowId.substring(0, hashIndex);
    const workflowName = trigger.workflowId.substring(hashIndex + 1);

    // Get the workflow file
    const workflowFile = this.app.vault.getAbstractFileByPath(workflowFilePath);
    if (!(workflowFile instanceof TFile)) {
      throw new Error(`Workflow file not found: ${workflowFilePath}`);
    }

    // Event loop prevention: mark the trigger file as being processed
    // This prevents workflows from re-triggering on the same file they just modified
    this.workflowModifiedFiles.add(filePath);

    // Also mark the workflow file itself to prevent self-modification loops
    this.workflowModifiedFiles.add(workflowFilePath);

    // Set up cleanup timer to remove the file from the blocked set
    // Use a longer timeout to account for async file operations
    const cleanupTimeout = setTimeout(() => {
      this.workflowModifiedFiles.delete(filePath);
      this.workflowModifiedFiles.delete(workflowFilePath);
    }, 2000); // 2 seconds should be enough for most workflows

    try {
      const fileContent = await this.app.vault.read(workflowFile);
      const workflow = parseWorkflowFromMarkdown(fileContent, workflowName);

      const executor = new WorkflowExecutor(this.app, this);

      const input: WorkflowInput = {
        variables: new Map(),
      };

      // Set event-specific variables
      input.variables.set("__eventType__", eventType);
      input.variables.set("__eventFilePath__", filePath);

      if (eventData.file) {
        input.variables.set("__eventFile__", JSON.stringify({
          path: eventData.file.path,
          basename: eventData.file.basename,
          name: eventData.file.name,
          extension: eventData.file.extension,
        }));
      }

      if (eventData.oldPath) {
        input.variables.set("__eventOldPath__", eventData.oldPath);
      }

      // Read file content for created/modified/opened events
      if (eventData.file && (eventType === "create" || eventType === "modify" || eventType === "file-open")) {
        try {
          const content = await this.app.vault.read(eventData.file);
          input.variables.set("__eventFileContent__", content);
        } catch {
          // File might not be readable (e.g., binary file)
        }
      }

      // Prompt callbacks for event execution (minimal interaction)
      // Track files modified by this workflow for event loop prevention
      const promptCallbacks = {
        promptForFile: () => Promise.resolve(null),
        promptForSelection: () => Promise.resolve(null),
        promptForValue: () => Promise.resolve(null),
        promptForConfirmation: (confirmPath: string, content: string, mode: string) => {
          // Track the file being confirmed for modification
          this.workflowModifiedFiles.add(confirmPath);
          setTimeout(() => this.workflowModifiedFiles.delete(confirmPath), 2000);
          return promptForConfirmation(this.app, confirmPath, content, mode);
        },
        promptForDialog: (title: string, message: string, options: string[], multiSelect: boolean, button1: string, button2?: string, markdown?: boolean, inputTitle?: string, defaults?: { input?: string; selected?: string[] }, multiline?: boolean) =>
          promptForDialog(this.app, title, message, options, multiSelect, button1, button2, markdown, inputTitle, defaults, multiline),
        openFile: async (notePath: string) => {
          const noteFile = this.app.vault.getAbstractFileByPath(notePath);
          if (noteFile instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(noteFile);
          }
        },
        showMcpApp: async () => {
          // Event-triggered workflows don't show execution modal, skip MCP App UI
        },
      };

      await executor.execute(
        workflow,
        input,
        () => {}, // Log callback
        {
          workflowPath: workflowFilePath,
          workflowName: workflowName,
          recordHistory: true,
        },
        promptCallbacks
      );

      // Silent success for event-triggered workflows to avoid notification spam
    } finally {
      // Clean up the timer if workflow completed before timeout
      clearTimeout(cleanupTimeout);
      // Note: We don't immediately remove from workflowModifiedFiles here
      // because the file system events might still be propagating
    }
  }

  // ========================================
  // Workspace State Methods (delegated to WorkspaceStateManager)
  // ========================================

  getWorkspaceStateFilePath(): string {
    return this.wsManager.getWorkspaceStateFilePath();
  }

  async loadWorkspaceState(): Promise<void> {
    return this.wsManager.loadWorkspaceState();
  }

  async loadOrCreateWorkspaceState(): Promise<void> {
    return this.wsManager.loadOrCreateWorkspaceState();
  }

  async saveWorkspaceState(): Promise<void> {
    return this.wsManager.saveWorkspaceState();
  }

  async changeWorkspaceFolder(newFolder: string): Promise<void> {
    // Manager handles migration, then we update settings
    await this.wsManager.changeWorkspaceFolder(newFolder);
    // Update settings after manager completes migration
    this.settings.workspaceFolder = newFolder;
    await this.saveSettings();
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
    initGeminiClient(this.settings.googleApiKey, getDefaultModelForPlan(this.settings.apiPlan));
    initFileSearchManager(this.settings.googleApiKey, this.app);

    // Initialize CLI provider manager
    initCliProviderManager();

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
    // Clear previous highlight and location first
    this.clearSelectionHighlight();
    this.selectionLocation = null;

    if (!view?.editor) {
      // Fallback to searching all markdown leaves
      this.captureSelection();
      return;
    }

    const editor = view.editor;
    const selection = editor.getSelection();
    if (selection) {
      this.lastSelection = selection;
      // Get selection range for highlighting
      const fromPos = editor.getCursor("from");
      const toPos = editor.getCursor("to");
      const from = editor.posToOffset(fromPos);
      const to = editor.posToOffset(toPos);
      this.applySelectionHighlight(view, from, to);
      // Store file path, line numbers, and character offsets
      const file = view.file;
      if (file) {
        this.selectionLocation = {
          filePath: file.path,
          startLine: fromPos.line + 1,
          endLine: toPos.line + 1,
          start: from,
          end: to,
        };
      }
    }
  }

  // Capture current selection from any markdown editor and apply highlight
  captureSelection(): void {
    // Clear previous highlight and location first
    this.clearSelectionHighlight();
    this.selectionLocation = null;

    // First try active view
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const editor = activeView.editor;
      const selection = editor.getSelection();
      if (selection) {
        this.lastSelection = selection;
        // Get selection range for highlighting
        const fromPos = editor.getCursor("from");
        const toPos = editor.getCursor("to");
        const from = editor.posToOffset(fromPos);
        const to = editor.posToOffset(toPos);
        this.applySelectionHighlight(activeView, from, to);
        // Store file path, line numbers, and character offsets
        const file = activeView.file;
        if (file) {
          this.selectionLocation = {
            filePath: file.path,
            startLine: fromPos.line + 1, // 1-indexed for display
            endLine: toPos.line + 1,
            start: from,
            end: to,
          };
        }
        return;
      }
    }

    // Fallback: search all markdown leaves for a selection
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView;
      if (view?.editor) {
        const editor = view.editor;
        const selection = editor.getSelection();
        if (selection) {
          this.lastSelection = selection;
          // Get selection range for highlighting
          const fromPos = editor.getCursor("from");
          const toPos = editor.getCursor("to");
          const from = editor.posToOffset(fromPos);
          const to = editor.posToOffset(toPos);
          this.applySelectionHighlight(view, from, to);
          // Store file path, line numbers, and character offsets
          const file = view.file;
          if (file) {
            this.selectionLocation = {
              filePath: file.path,
              startLine: fromPos.line + 1,
              endLine: toPos.line + 1,
              start: from,
              end: to,
            };
          }
          return;
        }
      }
    }
  }

  // Apply highlight decoration to the selection range
  private applySelectionHighlight(view: MarkdownView, from: number, to: number): void {
    try {
      // Access CodeMirror EditorView through the editor
      // @ts-expect-error - Obsidian's editor.cm is the CodeMirror EditorView
      const editorView = view.editor.cm as EditorView;
      if (!editorView) return;

      // Check if the StateField is already installed by directly querying the state
      const hasField = editorView.state.field(selectionHighlightField, false) !== undefined;
      if (!hasField) {
        editorView.dispatch({
          effects: StateEffect.appendConfig.of([selectionHighlightField]),
        });
      }

      // Apply the highlight
      editorView.dispatch({
        effects: setSelectionHighlight.of({ from, to }),
      });

      // Store the highlight info for later cleanup
      this.selectionHighlight = { view, from, to };
    } catch {
      // Ignore errors - highlight is optional
    }
  }

  // Clear the selection highlight
  clearSelectionHighlight(): void {
    if (!this.selectionHighlight) return;

    try {
      const { view } = this.selectionHighlight;
      // @ts-expect-error - Obsidian's editor.cm is the CodeMirror EditorView
      const editorView = view.editor?.cm as EditorView;
      if (editorView) {
        // Check if the field is installed before trying to clear
        const hasField = editorView.state.field(selectionHighlightField, false) !== undefined;
        if (hasField) {
          editorView.dispatch({
            effects: setSelectionHighlight.of(null),
          });
        }
      }
    } catch {
      // Ignore errors
    }

    this.selectionHighlight = null;
  }

  // Get the last captured selection
  getLastSelection(): string {
    return this.lastSelection;
  }

  // Get the location info of the last captured selection
  getSelectionLocation(): SelectionLocationInfo | null {
    return this.selectionLocation;
  }

  // Clear the cached selection (call after using it)
  clearLastSelection(): void {
    this.lastSelection = "";
    this.selectionLocation = null;
    this.clearSelectionHighlight();
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
      const storeId = await fileSearchManager.getOrCreateStore(storeName);

      // If store ID changed, clear files to force re-upload
      let currentSyncState = { files: ragSetting.files, lastFullSync: ragSetting.lastFullSync };
      if (ragSetting.storeId && ragSetting.storeId !== storeId) {
        // Store changed, need to re-upload all files
        currentSyncState = { files: {}, lastFullSync: null };
        new Notice("Store changed. Re-uploading all files...");
      }

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
        ...ragSetting,
        storeId: finalStoreId,
        storeName: storeName,
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
    if (!selected) return [];
    if (selected.isExternal) {
      return selected.storeIds;
    }
    return selected.storeId ? [selected.storeId] : [];
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
    const encryption = this.settings.encryption;

    // Check if encryption keys are configured (password has been set)
    if (!encryption?.publicKey || !encryption?.encryptedPrivateKey || !encryption?.salt) {
      new Notice(t("crypt.notConfigured"));
      throw new Error(t("crypt.notConfigured"));
    }

    try {
      // Read current content
      const content = await this.app.vault.read(file);

      // Check if already encrypted
      if (isEncryptedFile(content)) {
        new Notice(t("crypt.alreadyEncrypted"));
        return;
      }

      // Encrypt the content
      const encryptedContent = await encryptFileContent(
        content,
        encryption.publicKey,
        encryption.encryptedPrivateKey,
        encryption.salt
      );

      // Save encrypted content
      await this.app.vault.modify(file, encryptedContent);

      // Rename file to add .encrypted extension
      const newPath = file.path + ".encrypted";
      await this.app.vault.rename(file, newPath);

      new Notice(t("crypt.encryptSuccess"));

      // Reopen the file in CryptView
      await this.openCryptView(file);
    } catch (error) {
      console.error("Failed to encrypt file:", formatError(error));
      new Notice(t("crypt.encryptFailed"));
    }
  }

  /**
   * Check if a file is encrypted and open it in CryptView
   */
  private async checkAndOpenEncryptedFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      if (isEncryptedFile(content)) {
        // Small delay to let the markdown view finish opening
        setTimeout(() => {
          void this.openCryptView(file);
        }, 50);
      }
    } catch {
      // Ignore read errors
    }
  }

  /**
   * Open a file in CryptView
   */
  async openCryptView(file: TFile): Promise<void> {
    // Check if there's already a CryptView for this file
    const cryptLeaves = this.app.workspace.getLeavesOfType(CRYPT_VIEW_TYPE);
    for (const leaf of cryptLeaves) {
      const view = leaf.view as unknown as CryptView;
      if (view.filePath === file.path) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
        return;
      }
    }

    // Find existing markdown view for this file and replace it with CryptView
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of allLeaves) {
      const view = leaf.view as MarkdownView;
      if (view.file?.path === file.path) {
        // Replace the view in the same leaf instead of detaching
        await leaf.setViewState({
          type: CRYPT_VIEW_TYPE,
          active: true,
          state: { filePath: file.path },
        });
        return;
      }
    }

    // If no existing leaf found, create new CryptView in a new tab
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: CRYPT_VIEW_TYPE,
      active: true,
      state: { filePath: file.path },
    });
  }

  /**
   * Decrypt a file (remove encryption)
   */
  async decryptFile(file: TFile, decryptedContent: string): Promise<void> {
    try {
      await this.app.vault.modify(file, decryptedContent);

      // Remove .encrypted extension if present
      if (file.path.endsWith(".encrypted")) {
        const newPath = file.path.slice(0, -".encrypted".length);
        await this.app.vault.rename(file, newPath);
      }

      new Notice(t("crypt.decryptSuccess"));
    } catch (error) {
      console.error("Failed to decrypt file:", formatError(error));
      new Notice(t("crypt.decryptFailed"));
    }
  }

  // Decrypt current file (command handler)
  async decryptCurrentFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);

      // Check if file is encrypted
      if (!isEncryptedFile(content)) {
        new Notice(t("crypt.notEncrypted"));
        return;
      }

      // Try cached password first
      let password = cryptoCache.getPassword();

      if (!password) {
        // Prompt for password
        password = await new Promise<string | null>((resolve) => {
          class PasswordModal extends Modal {
            result: string | null = null;

            constructor(app: App) {
              super(app);
            }

            onOpen() {
              this.contentEl.createEl("h3", { text: t("crypt.enterPassword") });
              this.contentEl.createEl("p", { text: t("crypt.enterPasswordDesc") });

              const inputEl = this.contentEl.createEl("input", {
                type: "password",
                placeholder: t("crypt.passwordPlaceholder"),
                cls: "gemini-helper-password-input",
              });

              inputEl.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                  this.result = inputEl.value;
                  this.close();
                }
              });

              const buttonContainer = this.contentEl.createDiv({ cls: "modal-button-container" });

              buttonContainer.createEl("button", {
                text: t("common.cancel"),
              }).onclick = () => {
                this.close();
              };

              buttonContainer.createEl("button", {
                text: t("crypt.unlock"),
                cls: "mod-cta",
              }).onclick = () => {
                this.result = inputEl.value;
                this.close();
              };

              // Focus input
              setTimeout(() => inputEl.focus(), 10);
            }

            onClose() {
              resolve(this.result);
            }
          }

          new PasswordModal(this.app).open();
        });

        if (!password) {
          return; // User cancelled
        }
      }

      // Decrypt the file
      const decryptedContent = await decryptFileContent(content, password);

      // Cache the password
      cryptoCache.setPassword(password);

      // Write decrypted content back
      await this.app.vault.modify(file, decryptedContent);

      // Remove .encrypted extension if present
      if (file.path.endsWith(".encrypted")) {
        const newPath = file.path.slice(0, -".encrypted".length);
        await this.app.vault.rename(file, newPath);
      }

      new Notice(t("crypt.decryptSuccess"));
    } catch (error) {
      console.error("Failed to decrypt file:", formatError(error));
      new Notice(t("crypt.decryptFailed"));
    }
  }
}
