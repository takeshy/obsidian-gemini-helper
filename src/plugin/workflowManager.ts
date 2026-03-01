import { Notice, MarkdownView, TFile } from "obsidian";
import type { App } from "obsidian";
import type { ObsidianEventType, WorkflowEventTrigger, McpAppInfo } from "src/types";
import { WorkflowExecutor } from "src/workflow/executor";
import { parseWorkflowFromMarkdown } from "src/workflow/parser";
import type { WorkflowInput } from "src/workflow/types";
import { promptForDialog } from "src/ui/components/workflow/DialogPromptModal";
import { promptForConfirmation } from "src/ui/components/workflow/EditConfirmationModal";
import { promptForFile, promptForAnyFile, promptForNewFilePath } from "src/ui/components/workflow/FilePromptModal";
import { promptForSelection } from "src/ui/components/workflow/SelectionPromptModal";
import { promptForValue } from "src/ui/components/workflow/ValuePromptModal";
import { WorkflowExecutionModal } from "src/ui/components/workflow/WorkflowExecutionModal";
import { showMcpApp } from "src/ui/components/workflow/McpAppModal";
import { promptForPassword } from "src/ui/passwordPrompt";
import { matchFilePattern } from "src/utils/globMatcher";
import { isEncryptedFile } from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";
import type { GeminiHelperPlugin } from "src/plugin";

export class WorkflowManager {
  private plugin: GeminiHelperPlugin;
  private registeredWorkflowPaths: string[] = [];
  private eventListenersRegistered = false;
  // Event loop prevention: tracks files being modified by workflows
  private workflowModifiedFiles = new Set<string>();
  // Debounce timers for modify events (per file)
  private modifyDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly MODIFY_DEBOUNCE_MS = 5000; // 5 seconds debounce for modify events

  constructor(plugin: GeminiHelperPlugin) {
    this.plugin = plugin;
  }

  cleanup(): void {
    for (const timer of this.modifyDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.modifyDebounceTimers.clear();
    this.workflowModifiedFiles.clear();
  }

  private get app(): App {
    return this.plugin.app;
  }

  /**
   * Register workflows as Obsidian commands for hotkey support.
   * Note: Obsidian doesn't support unregistering commands, so once registered,
   * commands remain until plugin reload. We track all registered identifiers to avoid
   * duplicate registration errors.
   */
  registerHotkeys(): void {
    for (const workflowId of this.plugin.settings.enabledWorkflowHotkeys) {
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
      this.plugin.addCommand({
        id: obsidianCommandId,
        name: `Workflow: ${workflowName}`,
        callback: () => {
          void this.executeFromHotkey(filePath, workflowName);
        },
      });

      // Track as registered (never re-register in this session)
      this.registeredWorkflowPaths.push(workflowId);
    }
  }

  /**
   * Execute workflow from hotkey
   */
  async executeFromHotkey(filePath: string, workflowName: string): Promise<void> {
    // Capture selection before execution
    this.plugin.captureSelection();
    const selection = this.plugin.getLastSelection();
    const selectionLocation = this.plugin.getSelectionLocation();

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

      const executor = new WorkflowExecutor(this.app, this.plugin);

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
        promptForConfirmation: (confirmPath: string, confirmContent: string, mode: string) =>
          promptForConfirmation(this.app, confirmPath, confirmContent, mode),
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
          return promptForPassword(this.app);
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
      const message = formatError(error);
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
  registerEventListeners(): void {
    // Only register once to avoid duplicate listeners
    if (this.eventListenersRegistered) {
      return;
    }
    this.eventListenersRegistered = true;

    // File created
    this.plugin.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          void this.handleEvent("create", file.path, { file });
        }
      })
    );

    // File modified
    this.plugin.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          void this.handleEvent("modify", file.path, { file });
        }
      })
    );

    // File deleted
    this.plugin.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          void this.handleEvent("delete", file.path, { file });
        }
      })
    );

    // File renamed
    this.plugin.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          void this.handleEvent("rename", file.path, { file, oldPath });
        }
      })
    );

    // File opened
    this.plugin.registerEvent(
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
            void this.handleEvent("file-open", file.path, { file });
          })();
        }
      })
    );
  }

  /**
   * Handle a workflow event trigger.
   * Includes event loop prevention and debouncing for modify events.
   */
  private async handleEvent(
    eventType: ObsidianEventType,
    filePath: string,
    eventData: { file?: TFile; oldPath?: string }
  ): Promise<void> {
    const triggers = this.plugin.settings.enabledWorkflowEventTriggers;
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
      }, WorkflowManager.MODIFY_DEBOUNCE_MS);

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
        this.executeFromEvent(trigger, eventType, filePath, eventData)
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
  private async executeFromEvent(
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

      const executor = new WorkflowExecutor(this.app, this.plugin);

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
        promptForConfirmation: (confirmPath: string, confirmContent: string, mode: string) => {
          // Track the file being confirmed for modification
          this.workflowModifiedFiles.add(confirmPath);
          setTimeout(() => this.workflowModifiedFiles.delete(confirmPath), 2000);
          return promptForConfirmation(this.app, confirmPath, confirmContent, mode);
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
}
