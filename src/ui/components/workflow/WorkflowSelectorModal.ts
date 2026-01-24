import { App, Modal, TFile } from "obsidian";
import { t } from "src/i18n";
import { listWorkflowOptions, WorkflowOption } from "src/workflow/parser";
import { loadFromCodeBlock, LoadResult } from "src/workflow/codeblockSync";
import { SidebarNode, WorkflowNodeType } from "src/workflow/types";
import type { GeminiHelperPlugin } from "src/plugin";

function getNodeTypeLabels(): Record<WorkflowNodeType, string> {
  return {
    variable: t("workflow.nodeType.variable"),
    set: t("workflow.nodeType.set"),
    if: t("workflow.nodeType.if"),
    while: t("workflow.nodeType.while"),
    command: t("workflow.nodeType.command"),
    http: t("workflow.nodeType.http"),
    json: t("workflow.nodeType.json"),
    note: t("workflow.nodeType.note"),
    "note-read": t("workflow.nodeType.noteRead"),
    "note-search": t("workflow.nodeType.noteSearch"),
    "note-list": t("workflow.nodeType.noteList"),
    "folder-list": t("workflow.nodeType.folderList"),
    open: t("workflow.nodeType.open"),
    dialog: t("workflow.nodeType.dialog"),
    "prompt-file": t("workflow.nodeType.promptFile"),
    "prompt-selection": t("workflow.nodeType.promptSelection"),
    "file-explorer": t("workflow.nodeType.fileExplorer"),
    "file-save": t("workflow.nodeType.fileSave"),
    workflow: t("workflow.nodeType.workflow"),
    "rag-sync": t("workflow.nodeType.ragSync"),
    mcp: t("workflow.nodeType.mcp"),
    "obsidian-command": t("workflow.nodeType.obsidianCommand"),
    sleep: t("workflow.nodeType.sleep"),
  };
}

function getNodeSummary(node: SidebarNode): string {
  switch (node.type) {
    case "variable":
      return `${node.properties["name"]} = ${node.properties["value"]}`;
    case "set":
      return `${node.properties["name"]} = ${node.properties["value"]}`;
    case "if":
    case "while":
      return node.properties["condition"] || "(no condition)";
    case "command": {
      const prompt = node.properties["prompt"] || "";
      const truncated = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt;
      return truncated || "(no prompt)";
    }
    case "http":
      return `${node.properties["method"] || "POST"} ${node.properties["url"] || ""}`;
    case "json":
      return `${node.properties["source"]} -> ${node.properties["saveTo"]}`;
    case "note":
      return `${node.properties["path"]} (${node.properties["mode"] || "overwrite"})`;
    case "note-read":
      return `${node.properties["path"]} -> ${node.properties["saveTo"]}`;
    case "note-search":
      return `"${node.properties["query"]}" -> ${node.properties["saveTo"]}`;
    case "note-list":
      return `${node.properties["folder"] || "(root)"} -> ${node.properties["saveTo"]}`;
    case "folder-list":
      return `${node.properties["folder"] || "(all)"} -> ${node.properties["saveTo"]}`;
    case "open":
      return node.properties["path"] || "(no path)";
    case "dialog":
      return node.properties["title"] || "(no title)";
    case "prompt-file":
    case "prompt-selection":
    case "file-explorer":
      return node.properties["title"] || "(no title)";
    case "workflow":
      return `${node.properties["path"]}${node.properties["name"] ? ` (${node.properties["name"]})` : ""}`;
    case "rag-sync":
      return `${node.properties["path"]} → ${node.properties["ragSetting"]}`;
    case "file-save":
      return `${node.properties["source"]} → ${node.properties["path"]}`;
    case "mcp":
      return `${node.properties["tool"]} @ ${node.properties["url"]}`;
    case "obsidian-command":
      return node.properties["command"] || "(no command)";
    case "sleep":
      return `${node.properties["duration"] || "0"}ms`;
  }
}

export class WorkflowSelectorModal extends Modal {
  private plugin: GeminiHelperPlugin;
  private onExecute: (filePath: string, workflowName: string) => void;

  private files: TFile[] = [];
  private filteredFiles: TFile[] = [];
  private selectedFile: TFile | null = null;
  private fileContent: string = "";
  private workflowOptions: WorkflowOption[] = [];
  private selectedWorkflowIndex = 0;

  private searchInput: HTMLInputElement | null = null;
  private fileListEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private workflowSelectEl: HTMLSelectElement | null = null;
  private executeBtn: HTMLButtonElement | null = null;

  constructor(
    app: App,
    plugin: GeminiHelperPlugin,
    onExecute: (filePath: string, workflowName: string) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.onExecute = onExecute;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-selector-modal");
    modalEl.addClass("workflow-selector-modal-container");

    // Load and sort files (workflows/ first)
    this.files = this.app.vault.getMarkdownFiles().sort((a, b) => {
      const aInWorkflows = a.path.startsWith("workflows/");
      const bInWorkflows = b.path.startsWith("workflows/");
      if (aInWorkflows && !bInWorkflows) return -1;
      if (!aInWorkflows && bInWorkflows) return 1;
      return a.path.localeCompare(b.path);
    });
    this.filteredFiles = [...this.files];

    // Title
    contentEl.createEl("h2", { text: t("workflowSelector.title") });

    // Determine initial search query
    const lastPath = this.plugin.settings.lastSelectedWorkflowPath;
    let initialQuery = "workflows/";
    if (lastPath) {
      // Use the folder part of the last selected path
      const lastIndex = lastPath.lastIndexOf("/");
      if (lastIndex > 0) {
        initialQuery = lastPath.substring(0, lastIndex + 1);
      }
    }

    // Search box
    const searchContainer = contentEl.createDiv({ cls: "workflow-selector-search" });
    this.searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: t("workflowSelector.searchPlaceholder"),
      cls: "workflow-selector-search-input",
      value: initialQuery,
    });
    this.searchInput.addEventListener("input", () => this.onSearchInput());
    this.searchInput.addEventListener("keydown", (e) => this.onSearchKeydown(e));

    // Apply initial filter
    this.onSearchInput();

    // Main content area (two panes)
    const mainContent = contentEl.createDiv({ cls: "workflow-selector-main" });

    // Left pane: File list
    const leftPane = mainContent.createDiv({ cls: "workflow-selector-left-pane" });
    this.fileListEl = leftPane.createDiv({ cls: "workflow-selector-file-list" });
    this.renderFileList();

    // Right pane: Preview
    const rightPane = mainContent.createDiv({ cls: "workflow-selector-right-pane" });

    // Workflow selector (for files with multiple workflows)
    const workflowSelectContainer = rightPane.createDiv({ cls: "workflow-selector-dropdown-container is-hidden" });
    workflowSelectContainer.createEl("label", { text: t("workflowSelector.selectWorkflow") });
    this.workflowSelectEl = workflowSelectContainer.createEl("select", {
      cls: "workflow-selector-dropdown",
    });
    this.workflowSelectEl.addEventListener("change", () => {
      this.selectedWorkflowIndex = this.workflowSelectEl!.selectedIndex;
      void this.renderWorkflowPreview();
    });

    // Preview area
    this.previewEl = rightPane.createDiv({ cls: "workflow-selector-preview" });
    this.previewEl.setText(t("workflowSelector.selectFileToPreview"));

    // Buttons
    const buttonContainer = rightPane.createDiv({ cls: "workflow-selector-buttons" });

    const openBtn = buttonContainer.createEl("button", {
      text: t("workflowSelector.open"),
    });
    openBtn.addEventListener("click", () => this.onOpenClick());

    this.executeBtn = buttonContainer.createEl("button", {
      text: t("workflowSelector.execute"),
      cls: "mod-cta",
    });
    this.executeBtn.disabled = true;
    this.executeBtn.addEventListener("click", () => this.onExecuteClick());

    // Auto-select last selected file if it exists in filtered list
    if (lastPath) {
      const lastFile = this.filteredFiles.find((f) => f.path === lastPath);
      if (lastFile) {
        void this.selectFile(lastFile);
      }
    }

    // Focus search input and select all text for easy replacement
    this.searchInput.focus();
    this.searchInput.select();
  }

  private onSearchInput(): void {
    const query = this.searchInput?.value.toLowerCase().trim() || "";
    if (!query) {
      this.filteredFiles = [...this.files];
    } else {
      // Fuzzy search
      this.filteredFiles = this.files.filter((file) => {
        const path = file.path.toLowerCase();
        return this.fuzzyMatch(query, path);
      });
    }
    this.renderFileList();
  }

  private fuzzyMatch(query: string, text: string): boolean {
    let queryIndex = 0;
    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
      if (text[i] === query[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === query.length;
  }

  private onSearchKeydown(e: KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const firstItem = this.fileListEl?.querySelector(".workflow-selector-file-item") as HTMLElement;
      firstItem?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this.filteredFiles.length > 0) {
        void this.selectFile(this.filteredFiles[0]);
      }
    }
  }

  private renderFileList(): void {
    if (!this.fileListEl) return;
    this.fileListEl.empty();

    if (this.filteredFiles.length === 0) {
      this.fileListEl.createDiv({
        cls: "workflow-selector-no-files",
        text: t("workflowSelector.noWorkflows"),
      });
      return;
    }

    // Group files by folder
    let currentFolder = "";
    for (const file of this.filteredFiles) {
      const folder = file.parent?.path || "";
      if (folder !== currentFolder) {
        currentFolder = folder;
        const folderEl = this.fileListEl.createDiv({ cls: "workflow-selector-folder" });
        folderEl.createEl("span", {
          cls: "workflow-selector-folder-icon",
          text: "\u25B6",
        });
        folderEl.createEl("span", {
          text: folder || "/",
        });
      }

      const fileItem = this.fileListEl.createDiv({
        cls: "workflow-selector-file-item",
        attr: { tabindex: "0" },
      });
      fileItem.createEl("span", { text: file.basename });

      if (this.selectedFile?.path === file.path) {
        fileItem.addClass("is-selected");
      }

      fileItem.addEventListener("click", () => {
        void this.selectFile(file);
      });
      fileItem.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void this.selectFile(file);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = fileItem.nextElementSibling as HTMLElement;
          if (next?.classList.contains("workflow-selector-file-item")) {
            next.focus();
          } else if (next?.classList.contains("workflow-selector-folder")) {
            const nextItem = next.nextElementSibling as HTMLElement;
            nextItem?.focus();
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = fileItem.previousElementSibling as HTMLElement;
          if (prev?.classList.contains("workflow-selector-file-item")) {
            prev.focus();
          } else if (prev?.classList.contains("workflow-selector-folder")) {
            // Skip folder header
            const prevItem = prev.previousElementSibling as HTMLElement;
            if (prevItem?.classList.contains("workflow-selector-file-item")) {
              prevItem.focus();
            } else {
              this.searchInput?.focus();
            }
          } else {
            this.searchInput?.focus();
          }
        }
      });
    }
  }

  private async selectFile(file: TFile): Promise<void> {
    this.selectedFile = file;
    this.renderFileList();

    // Save last selected path to settings
    this.plugin.settings.lastSelectedWorkflowPath = file.path;
    void this.plugin.saveSettings();

    // Load file content and find workflows
    try {
      this.fileContent = await this.app.vault.read(file);
      this.workflowOptions = listWorkflowOptions(this.fileContent);
      this.selectedWorkflowIndex = 0;

      // Update workflow dropdown
      this.updateWorkflowDropdown();

      // Update preview
      void this.renderWorkflowPreview();

      // Enable execute button if workflows found
      if (this.executeBtn) {
        this.executeBtn.disabled = this.workflowOptions.length === 0;
      }
    } catch {
      if (this.previewEl) {
        this.previewEl.empty();
        this.previewEl.setText(t("workflowModal.failedToLoadPreview"));
      }
      this.workflowOptions = [];
      this.fileContent = "";
      if (this.executeBtn) {
        this.executeBtn.disabled = true;
      }
    }
  }

  private renderWorkflowPreview(): void {
    if (!this.previewEl || !this.selectedFile) return;
    this.previewEl.empty();

    if (this.workflowOptions.length === 0) {
      this.previewEl.setText(t("workflow.noWorkflowInFile"));
      return;
    }

    const selectedOption = this.workflowOptions[this.selectedWorkflowIndex];
    const result: LoadResult = loadFromCodeBlock(
      this.fileContent,
      selectedOption.name,
      selectedOption.name ? undefined : selectedOption.index
    );

    if (!result.data || result.data.nodes.length === 0) {
      this.previewEl.setText(t("workflow.noNodes"));
      return;
    }

    const nodes = result.data.nodes;
    const nodeTypeLabels = getNodeTypeLabels();

    // Render workflow name
    if (result.data.name) {
      const nameEl = this.previewEl.createDiv({ cls: "workflow-selector-workflow-name" });
      nameEl.setText(result.data.name);
    }

    // Render AI workflow history from callout (before visual workflow)
    this.renderAIWorkflowHistory();

    // Render nodes using same classes as WorkflowPanel
    const nodesContainer = this.previewEl.createDiv({ cls: "workflow-selector-nodes" });

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isBranchNode = node.type === "if" || node.type === "while";
      const nextNode = i < nodes.length - 1 ? nodes[i + 1] : null;

      const nodeCard = nodesContainer.createDiv({ cls: "workflow-node-card workflow-selector-node-card" });

      // Header
      const header = nodeCard.createDiv({ cls: "workflow-node-header" });
      header.createEl("span", {
        cls: "workflow-node-type",
        text: nodeTypeLabels[node.type] || node.type,
      });
      header.createEl("span", {
        cls: "workflow-node-id",
        text: node.id,
      });

      // Summary
      const summary = nodeCard.createDiv({ cls: "workflow-node-summary" });
      summary.setText(getNodeSummary(node));

      // Branch info for if/while nodes
      if (isBranchNode) {
        const branchInfo = nodeCard.createDiv({ cls: "workflow-node-branch" });

        const trueRow = branchInfo.createDiv({ cls: "workflow-branch-row" });
        trueRow.createEl("span", { cls: "workflow-branch-label workflow-branch-label-true", text: t("workflow.branchTrue") });
        trueRow.createEl("span", { cls: "workflow-branch-arrow", text: "→" });
        trueRow.createEl("span", { cls: "workflow-branch-target", text: node.trueNext || t("workflow.branchNext") });

        const falseRow = branchInfo.createDiv({ cls: "workflow-branch-row" });
        falseRow.createEl("span", { cls: "workflow-branch-label workflow-branch-label-false", text: t("workflow.branchFalse") });
        falseRow.createEl("span", { cls: "workflow-branch-arrow", text: "→" });
        falseRow.createEl("span", { cls: "workflow-branch-target", text: node.falseNext || t("workflow.branchEnd") });
      }

      // Arrow to next node (if not last and not branch node)
      if (nextNode && !isBranchNode) {
        nodesContainer.createDiv({ cls: "workflow-node-arrow" });
      }
    }
  }

  private renderAIWorkflowHistory(): void {
    if (!this.previewEl || !this.fileContent) return;

    // Parse AI Workflow History callout from file content
    // Format: > [!info] AI Workflow History
    //         > - date: action - "description"
    const calloutRegex = />\s*\[!info\]\s*AI Workflow History\n((?:>\s*-\s*.+\n?)+)/i;
    const match = this.fileContent.match(calloutRegex);

    if (!match) return;

    const historyLines = match[1]
      .split("\n")
      .map((line) => line.replace(/^>\s*-\s*/, "").trim())
      .filter((line) => line.length > 0);

    if (historyLines.length === 0) return;

    // Render collapsible history section using details/summary
    const details = this.previewEl.createEl("details", {
      cls: "workflow-selector-history",
      attr: { open: "" },
    });
    const summary = details.createEl("summary", { cls: "workflow-selector-history-summary" });
    summary.setText("AI workflow history");

    const historyList = details.createDiv({ cls: "workflow-selector-history-list" });

    // Show recent history entries (most recent first, they're already in order)
    const recentEntries = historyLines.slice(-5).reverse();

    for (const entry of recentEntries) {
      const historyItem = historyList.createDiv({ cls: "workflow-selector-history-item" });
      historyItem.setText(entry);
    }

    if (historyLines.length > 5) {
      historyList.createEl("div", {
        cls: "workflow-selector-history-more",
        text: `+${historyLines.length - 5} more`,
      });
    }
  }

  private updateWorkflowDropdown(): void {
    if (!this.workflowSelectEl) return;

    const container = this.workflowSelectEl.parentElement;
    this.workflowSelectEl.empty();

    if (this.workflowOptions.length === 0) {
      // No workflows found
      if (container) container.addClass("is-hidden");
      return;
    }

    if (this.workflowOptions.length === 1) {
      // Single workflow, hide dropdown
      if (container) container.addClass("is-hidden");
      this.selectedWorkflowIndex = 0;
      return;
    }

    // Multiple workflows, show dropdown
    if (container) container.removeClass("is-hidden");

    for (let i = 0; i < this.workflowOptions.length; i++) {
      const option = this.workflowOptions[i];
      const optionEl = this.workflowSelectEl.createEl("option", {
        value: String(i),
        text: option.label,
      });
      if (i === this.selectedWorkflowIndex) {
        optionEl.selected = true;
      }
    }
  }

  private onOpenClick(): void {
    if (!this.selectedFile) return;

    // Open the file in Obsidian
    const leaf = this.app.workspace.getLeaf();
    void leaf.openFile(this.selectedFile);
    this.close();
  }

  private onExecuteClick(): void {
    if (!this.selectedFile || this.workflowOptions.length === 0) return;

    const selectedOption = this.workflowOptions[this.selectedWorkflowIndex];
    const workflowName = selectedOption.name || selectedOption.label;

    this.close();
    this.onExecute(this.selectedFile.path, workflowName);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
