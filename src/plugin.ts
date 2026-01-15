import { Plugin, WorkspaceLeaf, Notice, MarkdownView, Platform, TFile, Modal, App } from "obsidian";
import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { EventEmitter } from "src/utils/EventEmitter";
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
  DEFAULT_SETTINGS,
  DEFAULT_MODEL,
  DEFAULT_WORKSPACE_STATE,
  DEFAULT_RAG_SETTING,
  DEFAULT_RAG_STATE,
  isModelAllowedForPlan,
} from "src/types";
import { initGeminiClient, resetGeminiClient, getGeminiClient } from "src/core/gemini";
import { WorkflowExecutor } from "src/workflow/executor";
import { parseWorkflowFromMarkdown } from "src/workflow/parser";
import type { WorkflowInput } from "src/workflow/types";
import { promptForDialog } from "src/ui/components/workflow/DialogPromptModal";
import { promptForConfirmation } from "src/ui/components/workflow/EditConfirmationModal";
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
import {
  initDeepResearchManager,
  resetDeepResearchManager,
} from "src/core/deepResearch";

const WORKSPACE_STATE_FILENAME = "gemini-workspace.json";
const OLD_WORKSPACE_STATE_FILENAME = ".gemini-workspace.json";
const OLD_RAG_STATE_FILENAME = ".gemini-rag-state.json";

// Selection highlight decoration
const selectionHighlightMark = Decoration.mark({ class: "gemini-helper-selection-highlight" });

// StateEffect to set/clear the highlight range
const setSelectionHighlight = StateEffect.define<{ from: number; to: number } | null>();

// StateField to manage highlight decorations
const selectionHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Map decorations through document changes
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(setSelectionHighlight)) {
        if (effect.value === null) {
          // Clear highlight
          decorations = Decoration.none;
        } else {
          // Set new highlight
          const { from, to } = effect.value;
          decorations = Decoration.set([selectionHighlightMark.range(from, to)]);
        }
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});


// Selection highlight info
interface SelectionHighlightInfo {
  view: MarkdownView;
  from: number;
  to: number;
}

// Selection location info (file path, line numbers, and character offsets)
interface SelectionLocationInfo {
  filePath: string;
  startLine: number;
  endLine: number;
  start: number;  // Character offset from beginning of file
  end: number;    // Character offset from beginning of file
}

export class GeminiHelperPlugin extends Plugin {
  settings: GeminiHelperSettings = { ...DEFAULT_SETTINGS };
  workspaceState: WorkspaceState = { ...DEFAULT_WORKSPACE_STATE };
  settingsEmitter = new EventEmitter();
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

  onload(): void {
    // Initialize i18n locale
    initLocale();

    // Load settings and workspace state
    void this.loadSettings().then(async () => {
      // Migrate from old settings format first (one-time)
      try {
        await this.migrateFromOldSettings();
      } catch (e) {
        console.error("Gemini Helper: Failed to migrate old settings:", e);
      }
      try {
        await this.loadWorkspaceState();
      } catch (e) {
        console.error("Gemini Helper: Failed to load workspace state:", e);
      }
      // Initialize clients if API key is set or any CLI is verified
      try {
        const cliConfig = this.settings.cliConfig || DEFAULT_CLI_CONFIG;
        if (this.settings.googleApiKey || hasVerifiedCli(cliConfig)) {
          this.initializeClients();
        }
      } catch (e) {
        console.error("Gemini Helper: Failed to initialize clients:", e);
      }
      // Register workflows as Obsidian commands for hotkey support
      try {
        this.registerWorkflowHotkeys();
      } catch (e) {
        console.error("Gemini Helper: Failed to register workflow hotkeys:", e);
      }
      // Register event listeners for workflow triggers
      try {
        this.registerWorkflowEventListeners();
      } catch (e) {
        console.error("Gemini Helper: Failed to register workflow event listeners:", e);
      }
      // Emit event to refresh UI after workspace state is loaded
      this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
    }).catch((e) => {
      console.error("Gemini Helper: Failed to load settings:", e);
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

    // Register file menu (right-click) for encryption
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
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            void this.decryptCurrentFile(activeFile);
          }
          return true;
        }
        return false;
      },
    });

    // Register file events for edit history
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md") {
          const historyManager = getEditHistoryManager();
          if (historyManager) {
            void historyManager.handleFileRename(oldPath, file.path);
          }
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          const historyManager = getEditHistoryManager();
          if (historyManager) {
            void historyManager.handleFileDelete(file.path);
          }
        }
      })
    );

    // Initialize snapshot when a file is opened (for edit history)
    // Also check if file is encrypted and open in CryptView
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          const historyManager = getEditHistoryManager();
          if (historyManager) {
            void historyManager.initSnapshot(file.path);
          }

          // Check if file is encrypted and redirect to CryptView
          void this.checkAndOpenEncryptedFile(file);
        }
      })
    );

  }

  private async restorePreviousVersion(filePath: string): Promise<void> {
    const historyManager = getEditHistoryManager();
    if (!historyManager) {
      new Notice("Edit history manager not initialized");
      return;
    }

    const history = await historyManager.getHistory(filePath);
    if (history.length === 0) {
      new Notice(t("editHistoryModal.noHistory"));
      return;
    }

    // Get the most recent entry and restore to before that change
    const lastEntry = history[history.length - 1];
    const confirmed = confirm(t("editHistoryModal.confirmRestore"));
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
    resetDeepResearchManager();

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
      // Deep copy array to avoid mutating DEFAULT_SETTINGS
      // Use loaded commands if present, otherwise use default commands
      slashCommands: loaded.slashCommands
        ? [...loaded.slashCommands]
        : [...DEFAULT_SETTINGS.slashCommands],
      // Deep merge editHistory settings
      editHistory: {
        ...DEFAULT_EDIT_HISTORY_SETTINGS,
        ...(loaded.editHistory ?? {}),
        retention: {
          ...DEFAULT_EDIT_HISTORY_SETTINGS.retention,
          ...(loaded.editHistory?.retention ?? {}),
        },
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
   * Execute workflow from hotkey
   */
  private async executeWorkflowFromHotkey(filePath: string, workflowName: string): Promise<void> {
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

    try {
      const fileContent = await this.app.vault.read(file);
      const workflow = parseWorkflowFromMarkdown(fileContent, workflowName);

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

      // Prompt callbacks for hotkey execution
      const promptCallbacks = {
        promptForFile: () => Promise.resolve(null),
        promptForSelection: () => Promise.resolve(null),
        promptForValue: () => Promise.resolve(null),
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
      };

      await executor.execute(
        workflow,
        input,
        () => {}, // Log callback
        {
          workflowPath: filePath,
          workflowName: workflowName,
          recordHistory: true,
        },
        promptCallbacks
      );

      new Notice("Workflow completed successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
      this.app.workspace.on("file-open", async (file) => {
        if (file instanceof TFile) {
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
        }
      })
    );
  }

  /**
   * Glob pattern matching for file paths.
   * Supports: * (any characters except /), ** (any characters including /), ? (single char),
   * {a,b,c} (brace expansion), [abc] (character class), [a-z] (character range), [!abc] (negated class)
   */
  private matchFilePattern(pattern: string, filePath: string): boolean {
    // Handle brace expansion first: {a,b,c} -> (a|b|c)
    // This needs to be done before regex escaping
    const expandBraces = (p: string): string => {
      const braceRegex = /\{([^{}]+)\}/g;
      return p.replace(braceRegex, (_, content: string) => {
        const alternatives = content.split(",").map((alt: string) => alt.trim());
        return `(${alternatives.join("|")})`;
      });
    };

    let regexPattern = expandBraces(pattern);

    // Handle character classes [abc], [a-z], [!abc] before escaping
    // Replace [!...] with [^...] for negation
    regexPattern = regexPattern.replace(/\[!/g, "[^");

    // Now escape regex special characters except *, ?, and character class brackets
    // We need to be careful not to escape brackets that are part of character classes
    const escapeRegexChars = (p: string): string => {
      let result = "";
      let inCharClass = false;
      for (let i = 0; i < p.length; i++) {
        const char = p[i];
        if (char === "[" && !inCharClass) {
          inCharClass = true;
          result += char;
        } else if (char === "]" && inCharClass) {
          inCharClass = false;
          result += char;
        } else if (!inCharClass && ".+^${}()|\\".includes(char)) {
          // Escape special regex chars (except * and ? which we handle separately)
          // Note: {} are already processed by brace expansion, but we keep them in case of nested/unmatched
          result += "\\" + char;
        } else {
          result += char;
        }
      }
      return result;
    };

    regexPattern = escapeRegexChars(regexPattern);

    // Convert ** to a placeholder first (before handling single *)
    regexPattern = regexPattern.replace(/\*\*/g, "<<<DOUBLESTAR>>>");
    // Convert * to match anything except /
    regexPattern = regexPattern.replace(/\*/g, "[^/]*");
    // Convert ? to match any single character (except /)
    regexPattern = regexPattern.replace(/\?/g, "[^/]");
    // Convert ** placeholder to match anything including /
    regexPattern = regexPattern.replace(/<<<DOUBLESTAR>>>/g, ".*");

    // Ensure the pattern matches the whole path
    try {
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filePath);
    } catch {
      // Invalid regex pattern, return false
      console.warn(`Invalid file pattern: ${pattern}`);
      return false;
    }
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
        if (!this.matchFilePattern(trigger.filePattern, filePath)) {
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
          result.reason
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

  // Get the path to the workspace state file
  private getWorkspaceStateFilePath(): string {
    const folder = this.settings.workspaceFolder || "";
    return folder ? `${folder}/${WORKSPACE_STATE_FILENAME}` : WORKSPACE_STATE_FILENAME;
  }

  // Get the path to the old RAG state file (for migration)
  private getOldRagStateFilePath(): string {
    const folder = this.settings.workspaceFolder || "";
    return folder ? `${folder}/${OLD_RAG_STATE_FILENAME}` : OLD_RAG_STATE_FILENAME;
  }

  // Get old workspace state file path (for migration)
  private getOldWorkspaceStateFilePath(): string {
    const folder = this.settings.workspaceFolder || "";
    return folder ? `${folder}/${OLD_WORKSPACE_STATE_FILENAME}` : OLD_WORKSPACE_STATE_FILENAME;
  }

  // Load workspace state from file
  async loadWorkspaceState(): Promise<void> {
    this.workspaceState = { ...DEFAULT_WORKSPACE_STATE };

    const filePath = this.getWorkspaceStateFilePath();

    try {
      let exists = await this.app.vault.adapter.exists(filePath);

      // Migrate from old hidden file name if new file doesn't exist
      if (!exists) {
        const oldFilePath = this.getOldWorkspaceStateFilePath();
        const oldExists = await this.app.vault.adapter.exists(oldFilePath);
        if (oldExists) {
          const content = await this.app.vault.adapter.read(oldFilePath);
          await this.app.vault.adapter.write(filePath, content);
          await this.app.vault.adapter.remove(oldFilePath);
          exists = true;
        }
      }

      if (exists) {
        const content = await this.app.vault.adapter.read(filePath);
        const loaded = JSON.parse(content) as Partial<WorkspaceState>;
        this.workspaceState = { ...DEFAULT_WORKSPACE_STATE, ...loaded };

        // Ensure each RAG setting has all required fields (migration for new fields)
        for (const [settingName, setting] of Object.entries(this.workspaceState.ragSettings)) {
          this.workspaceState.ragSettings[settingName] = {
            ...DEFAULT_RAG_SETTING,
            ...setting,
          };
        }

        // Sync FileSearchManager with selected RAG setting's store ID
        this.syncFileSearchManagerWithSelectedRag();
      } else {
        // Check for old RAG state file and migrate
        await this.migrateOldRagStateFile();
      }
    } catch (error) {
      // Log error for debugging
      console.error("Gemini Helper: Failed to load workspace state:", error);
    }
  }

  // Migrate old .gemini-rag-state.json to new format
  private async migrateOldRagStateFile(): Promise<void> {
    const oldFilePath = this.getOldRagStateFilePath();

    try {
      const exists = await this.app.vault.adapter.exists(oldFilePath);
      if (!exists) return;

      const content = await this.app.vault.adapter.read(oldFilePath);
      const oldState = JSON.parse(content) as Partial<RagState>;

      // Convert old format to new RagSetting
      // Detect external store: has storeId but no storeName
      const isExternal = !!(oldState.storeId && !oldState.storeName);
      const ragSetting: RagSetting = {
        storeId: isExternal ? null : (oldState.storeId || null),
        storeIds: isExternal && oldState.storeId ? [oldState.storeId] : [],
        storeName: oldState.storeName || null,
        isExternal,
        targetFolders: oldState.includeFolders || [],
        excludePatterns: oldState.excludePatterns || [],
        files: oldState.files || {},
        lastFullSync: oldState.lastFullSync || null,
      };

      // Create default name based on store name or "default"
      const settingName = oldState.storeName || "default";

      this.workspaceState = {
        selectedRagSetting: settingName,
        selectedModel: null,
        ragSettings: {
          [settingName]: ragSetting,
        },
      };

      // Save new format
      await this.saveWorkspaceState();

      // Delete old file
      await this.app.vault.adapter.remove(oldFilePath);

      // Sync FileSearchManager
      this.syncFileSearchManagerWithSelectedRag();
    } catch (error) {
      // Log error for debugging
      console.error("Gemini Helper: Migration from old RAG state file failed:", error);
    }
  }

  // Sync FileSearchManager with currently selected RAG setting
  private syncFileSearchManagerWithSelectedRag(): void {
    const fileSearchManager = getFileSearchManager();
    const selectedRag = this.getSelectedRagSetting();

    if (!fileSearchManager) return;

    if (selectedRag?.storeId) {
      fileSearchManager.setStoreName(selectedRag.storeId);
    } else {
      fileSearchManager.setStoreName(null);
    }
  }

  // Load workspace state, create file if not exists
  async loadOrCreateWorkspaceState(): Promise<void> {
    await this.loadWorkspaceState();

    const filePath = this.getWorkspaceStateFilePath();
    const exists = await this.app.vault.adapter.exists(filePath);
    if (!exists) {
      await this.saveWorkspaceState();
    }
  }

  // Save workspace state to file
  async saveWorkspaceState(): Promise<void> {
    const filePath = this.getWorkspaceStateFilePath();
    const content = JSON.stringify(this.workspaceState, null, 2);

    // Ensure folder exists
    const folder = this.settings.workspaceFolder;
    if (folder) {
      const folderExists = await this.app.vault.adapter.exists(folder);
      if (!folderExists) {
        await this.app.vault.createFolder(folder);
      }
    }

    await this.app.vault.adapter.write(filePath, content);
  }

  // Change workspace folder and migrate state file
  async changeWorkspaceFolder(newFolder: string): Promise<void> {
    const oldFolder = this.settings.workspaceFolder;

    // If same folder, do nothing
    if (oldFolder === newFolder) return;

    const oldFilePath = this.getWorkspaceStateFilePath();

    // Update settings first
    this.settings.workspaceFolder = newFolder;
    await this.saveSettings();

    // Check if new folder already has a state file
    const newFilePath = this.getWorkspaceStateFilePath();
    const newFileExists = await this.app.vault.adapter.exists(newFilePath);

    if (newFileExists) {
      // Load existing state from new folder
      await this.loadWorkspaceState();
    } else {
      // Copy state to new folder
      try {
        const oldFileExists = await this.app.vault.adapter.exists(oldFilePath);
        if (oldFileExists) {
          const content = await this.app.vault.adapter.read(oldFilePath);

          // Ensure new folder exists
          if (newFolder) {
            const folderExists = await this.app.vault.adapter.exists(newFolder);
            if (!folderExists) {
              await this.app.vault.createFolder(newFolder);
            }
          }

          // Write to new location
          await this.app.vault.adapter.write(newFilePath, content);
        } else {
          // No old file, save current state to new location
          await this.saveWorkspaceState();
        }
      } catch {
        // Failed to copy, just save current state
        await this.saveWorkspaceState();
      }
    }

    // Sync FileSearchManager with selected RAG
    this.syncFileSearchManagerWithSelectedRag();

    // Emit event
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Get currently selected RAG setting
  getSelectedRagSetting(): RagSetting | null {
    const name = this.workspaceState.selectedRagSetting;
    if (!name) return null;
    return this.workspaceState.ragSettings[name] || null;
  }

  // Get RAG setting by name
  getRagSetting(name: string): RagSetting | null {
    return this.workspaceState.ragSettings[name] || null;
  }

  // Get all RAG setting names
  getRagSettingNames(): string[] {
    return Object.keys(this.workspaceState.ragSettings);
  }

  // Select a RAG setting
  async selectRagSetting(name: string | null): Promise<void> {
    this.workspaceState.selectedRagSetting = name;
    await this.saveWorkspaceState();
    this.syncFileSearchManagerWithSelectedRag();
    this.settingsEmitter.emit("rag-setting-changed", name);
  }

  // Select a model
  async selectModel(model: ModelType): Promise<void> {
    this.workspaceState.selectedModel = model;
    await this.saveWorkspaceState();
  }

  // Get selected model
  getSelectedModel(): ModelType {
    const selected = this.workspaceState.selectedModel || DEFAULT_MODEL;

    // CLI models are only allowed on desktop if verified
    const cliConfig = this.settings.cliConfig;
    if (selected === "gemini-cli") {
      if (Platform.isMobile || !cliConfig?.cliVerified) {
        return DEFAULT_MODEL;
      }
      return selected;
    }
    if (selected === "claude-cli") {
      if (Platform.isMobile || !cliConfig?.claudeCliVerified) {
        return DEFAULT_MODEL;
      }
      return selected;
    }
    if (selected === "codex-cli") {
      if (Platform.isMobile || !cliConfig?.codexCliVerified) {
        return DEFAULT_MODEL;
      }
      return selected;
    }

    return isModelAllowedForPlan(this.settings.apiPlan, selected)
      ? selected
      : DEFAULT_MODEL;
  }

  // Create a new RAG setting
  async createRagSetting(name: string, setting?: Partial<RagSetting>): Promise<void> {
    if (this.workspaceState.ragSettings[name]) {
      throw new Error(`Semantic search setting "${name}" already exists`);
    }

    this.workspaceState.ragSettings[name] = {
      ...DEFAULT_RAG_SETTING,
      ...setting,
    };

    await this.saveWorkspaceState();
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Update a RAG setting
  async updateRagSetting(name: string, updates: Partial<RagSetting>): Promise<void> {
    const existing = this.workspaceState.ragSettings[name];
    if (!existing) {
      throw new Error(`Semantic search setting "${name}" not found`);
    }

    this.workspaceState.ragSettings[name] = {
      ...existing,
      ...updates,
    };

    await this.saveWorkspaceState();

    // If this is the selected setting, sync FileSearchManager
    if (name === this.workspaceState.selectedRagSetting) {
      this.syncFileSearchManagerWithSelectedRag();
    }
  }

  // Delete a RAG setting
  async deleteRagSetting(name: string): Promise<void> {
    if (!this.workspaceState.ragSettings[name]) {
      return;
    }

    delete this.workspaceState.ragSettings[name];

    // If this was the selected setting, clear selection
    if (this.workspaceState.selectedRagSetting === name) {
      this.workspaceState.selectedRagSetting = null;
    }

    await this.saveWorkspaceState();
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Rename a RAG setting
  async renameRagSetting(oldName: string, newName: string): Promise<void> {
    if (!this.workspaceState.ragSettings[oldName]) {
      throw new Error(`Semantic search setting "${oldName}" not found`);
    }
    if (this.workspaceState.ragSettings[newName]) {
      throw new Error(`Semantic search setting "${newName}" already exists`);
    }

    this.workspaceState.ragSettings[newName] = this.workspaceState.ragSettings[oldName];
    delete this.workspaceState.ragSettings[oldName];

    // Update selection if needed
    if (this.workspaceState.selectedRagSetting === oldName) {
      this.workspaceState.selectedRagSetting = newName;
    }

    await this.saveWorkspaceState();
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Reset sync state for a RAG setting
  async resetRagSettingSyncState(name: string): Promise<void> {
    const setting = this.workspaceState.ragSettings[name];
    if (!setting) {
      throw new Error(`Semantic search setting "${name}" not found`);
    }

    this.workspaceState.ragSettings[name] = {
      ...setting,
      files: {},
      lastFullSync: null,
    };

    await this.saveWorkspaceState();
    new Notice("Sync state has been reset. Next sync will re-upload all files.");
  }

  // Migrate from old settings format
  private async migrateFromOldSettings(): Promise<void> {
    const data = await this.loadData();
    if (!data) return;

    let needsSave = false;

    // Migrate chatsFolder to workspaceFolder
    if (data.chatsFolder !== undefined && data.workspaceFolder === undefined) {
      data.workspaceFolder = data.chatsFolder;
      delete data.chatsFolder;
      this.settings.workspaceFolder = data.workspaceFolder as string;
      needsSave = true;
    }

    // Check for old RAG format fields in settings (very old format)
    const oldStoreId = data.ragStoreId as string | null | undefined;
    const oldSyncState = data.ragSyncState as { files?: Record<string, unknown>; lastFullSync?: number | null } | undefined;
    const oldIncludeFolders = data.ragIncludeFolders as string[] | undefined;
    const oldExcludePatterns = data.ragExcludePatterns as string[] | undefined;

    if (oldStoreId || (oldSyncState && Object.keys(oldSyncState.files || {}).length > 0) || oldIncludeFolders || oldExcludePatterns) {
      // Migrate to new workspace state format
      const ragSetting: RagSetting = {
        storeId: oldStoreId || null,
        storeIds: [],
        storeName: null,
        isExternal: false,
        targetFolders: oldIncludeFolders || [],
        excludePatterns: oldExcludePatterns || [],
        files: (oldSyncState?.files || {}) as RagSetting["files"],
        lastFullSync: oldSyncState?.lastFullSync || null,
      };

      this.workspaceState = {
        selectedRagSetting: "default",
        selectedModel: null,
        ragSettings: {
          default: ragSetting,
        },
      };

      // Save to new state file
      await this.saveWorkspaceState();

      // Remove old fields from settings
      delete data.ragStoreId;
      delete data.ragSyncState;
      delete data.ragAutoSync;
      delete data.ragIncludeFolders;
      delete data.ragExcludePatterns;
      needsSave = true;

      // Sync FileSearchManager
      this.syncFileSearchManagerWithSelectedRag();
    }

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
      needsSave = true;
    }

    if (needsSave) {
      await this.saveData(data);
      await this.saveSettings();
    }
  }

  // Get vault name for store naming
  getVaultStoreName(): string {
    const vaultName = this.app.vault.getName();
    return `obsidian-${vaultName}`;
  }

  private initializeClients() {
    initGeminiClient(this.settings.googleApiKey, DEFAULT_MODEL);
    initFileSearchManager(this.settings.googleApiKey, this.app);

    // Initialize CLI provider manager
    initCliProviderManager();

    // Initialize edit history manager
    const editHistorySettings = this.settings.editHistory || DEFAULT_EDIT_HISTORY_SETTINGS;
    initEditHistoryManager(this.app, this.settings.workspaceFolder, editHistorySettings);

    // Initialize Deep Research manager
    if (this.settings.googleApiKey) {
      initDeepResearchManager(this.settings.googleApiKey, this.app, this.settings.workspaceFolder);
    }

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

    // Check if encryption is configured
    if (!encryption?.enabled || !encryption?.publicKey || !encryption?.encryptedPrivateKey || !encryption?.salt) {
      new Notice(t("crypt.notConfigured"));
      return;
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
      new Notice(t("crypt.encryptSuccess"));

      // Reopen the file in CryptView
      await this.openCryptView(file);
    } catch (error) {
      console.error("Failed to encrypt file:", error);
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

    // Find and close any view that has this file open (markdown, etc.)
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of allLeaves) {
      const view = leaf.view as MarkdownView;
      if (view.file?.path === file.path) {
        leaf.detach();
        break;
      }
    }

    // Create new CryptView in a new tab
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
      new Notice(t("crypt.decryptSuccess"));
    } catch (error) {
      console.error("Failed to decrypt file:", error);
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
      new Notice(t("crypt.decryptSuccess"));
    } catch (error) {
      console.error("Failed to decrypt file:", error);
      new Notice(t("crypt.decryptFailed"));
    }
  }
}
