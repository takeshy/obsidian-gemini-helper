import { Plugin, WorkspaceLeaf, Notice, MarkdownView } from "obsidian";
import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { EventEmitter } from "src/utils/EventEmitter";
import { ChatView, VIEW_TYPE_GEMINI_CHAT } from "src/ui/ChatView";
import { SettingsTab } from "src/ui/SettingsTab";
import {
  type GeminiHelperSettings,
  type WorkspaceState,
  type RagSetting,
  type RagState,
  type ModelType,
  DEFAULT_SETTINGS,
  DEFAULT_MODEL,
  DEFAULT_WORKSPACE_STATE,
  DEFAULT_RAG_SETTING,
  DEFAULT_RAG_STATE,
  isModelAllowedForPlan,
} from "src/types";
import { initGeminiClient, resetGeminiClient } from "src/core/gemini";
import {
  initFileSearchManager,
  resetFileSearchManager,
  getFileSearchManager,
  type SyncResult,
} from "src/core/fileSearch";
import { formatError } from "src/utils/error";

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

// Selection location info (file path and line numbers)
interface SelectionLocationInfo {
  filePath: string;
  startLine: number;
  endLine: number;
}

export class GeminiHelperPlugin extends Plugin {
  settings!: GeminiHelperSettings;
  workspaceState: WorkspaceState = { ...DEFAULT_WORKSPACE_STATE };
  settingsEmitter = new EventEmitter();
  private lastSelection = "";
  private selectionHighlight: SelectionHighlightInfo | null = null;
  private selectionLocation: SelectionLocationInfo | null = null;
  private lastActiveMarkdownView: MarkdownView | null = null;

  onload(): void {
    // Load settings and workspace state
    void this.loadSettings().then(async () => {
      // Migrate from old settings format first (one-time)
      await this.migrateFromOldSettings();
      await this.loadWorkspaceState();
      // Initialize Gemini client if API key is set
      if (this.settings.googleApiKey) {
        this.initializeClients();
      }
      // Emit event to refresh UI after workspace state is loaded
      this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
    });

    // Add settings tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // Register chat view
    this.registerView(
      VIEW_TYPE_GEMINI_CHAT,
      (leaf) => new ChatView(leaf, this)
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
  }

  onunload(): void {
    this.clearSelectionHighlight();
    resetGeminiClient();
    resetFileSearchManager();
  }

  async loadSettings() {
    const loaded = await this.loadData() ?? {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      // Deep copy array to avoid mutating DEFAULT_SETTINGS
      slashCommands: loaded.slashCommands ? [...loaded.slashCommands] : [],
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

    // Reinitialize clients if API key changed
    if (this.settings.googleApiKey) {
      this.initializeClients();
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
    } catch {
      // Failed to load, use default
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
    } catch {
      // Migration failed, continue with default
    }
  }

  // Sync FileSearchManager with currently selected RAG setting
  private syncFileSearchManagerWithSelectedRag(): void {
    const fileSearchManager = getFileSearchManager();
    const selectedRag = this.getSelectedRagSetting();

    if (fileSearchManager && selectedRag?.storeId) {
      fileSearchManager.setStoreName(selectedRag.storeId);
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

    if (needsSave) {
      await this.saveData(data);
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
      // Store file path and line numbers
      const file = view.file;
      if (file) {
        this.selectionLocation = {
          filePath: file.path,
          startLine: fromPos.line + 1,
          endLine: toPos.line + 1,
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
        // Store file path and line numbers
        const file = activeView.file;
        if (file) {
          this.selectionLocation = {
            filePath: file.path,
            startLine: fromPos.line + 1, // 1-indexed for display
            endLine: toPos.line + 1,
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
          // Store file path and line numbers
          const file = view.file;
          if (file) {
            this.selectionLocation = {
              filePath: file.path,
              startLine: fromPos.line + 1,
              endLine: toPos.line + 1,
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
}
