import { App, Modal, Setting, TFile } from "obsidian";
import { SidebarNode, WorkflowNodeType } from "src/workflow/types";
import { getAvailableModels, CLI_MODEL, CLAUDE_CLI_MODEL, CODEX_CLI_MODEL } from "src/types";
import type { GeminiHelperPlugin } from "src/plugin";
import { t, TranslationKey } from "src/i18n";

// @ path autocomplete helper
interface PathSuggestion {
  path: string;
  display: string;
}

function buildPathSuggestions(app: App, query: string): PathSuggestion[] {
  const files = app.vault.getMarkdownFiles();
  const lowerQuery = query.toLowerCase();

  const suggestions = files
    .filter(f => {
      const path = f.path.toLowerCase();
      const basename = f.basename.toLowerCase();
      return !query || path.includes(lowerQuery) || basename.includes(lowerQuery);
    })
    .map(f => ({
      path: f.path,
      display: f.path,
    }))
    .slice(0, 15);

  return suggestions;
}

// Expand @path references to file content
async function expandPathReferences(app: App, text: string): Promise<string> {
  // Match @path/to/file.md or @"path with spaces.md" pattern
  const atPathPattern = /@"([^"]+)"|@(\S+\.md)/g;

  const matches: Array<{ fullMatch: string; path: string }> = [];
  let match;
  while ((match = atPathPattern.exec(text)) !== null) {
    const path = match[1] || match[2]; // quoted or unquoted path
    matches.push({ fullMatch: match[0], path });
  }

  if (matches.length === 0) return text;

  let result = text;
  for (const { fullMatch, path } of matches) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const content = await app.vault.read(file);
      result = result.replace(fullMatch, content);
    }
  }

  return result;
}

function getNodeTypeLabel(type: WorkflowNodeType): string {
  const keyMap: Record<WorkflowNodeType, TranslationKey> = {
    variable: "workflow.nodeType.variable",
    set: "workflow.nodeType.set",
    if: "workflow.nodeType.if",
    while: "workflow.nodeType.while",
    command: "workflow.nodeType.command",
    http: "workflow.nodeType.http",
    json: "workflow.nodeType.json",
    note: "workflow.nodeType.note",
    "note-read": "workflow.nodeType.noteRead",
    "note-search": "workflow.nodeType.noteSearch",
    "note-list": "workflow.nodeType.noteList",
    "folder-list": "workflow.nodeType.folderList",
    open: "workflow.nodeType.open",
    dialog: "workflow.nodeType.dialog",
    "prompt-file": "workflow.nodeType.promptFile",
    "prompt-selection": "workflow.nodeType.promptSelection",
    "file-explorer": "workflow.nodeType.fileExplorer",
    "file-save": "workflow.nodeType.fileSave",
    workflow: "workflow.nodeType.workflow",
    "rag-sync": "workflow.nodeType.ragSync",
    mcp: "workflow.nodeType.mcp",
    "obsidian-command": "workflow.nodeType.obsidianCommand",
    sleep: "workflow.nodeType.sleep",
  };
  return t(keyMap[type]);
}

export class NodeEditorModal extends Modal {
  private node: SidebarNode;
  private onSave: (node: SidebarNode) => void;
  private editedProperties: Record<string, string>;
  private editedNext?: string;
  private editedTrueNext?: string;
  private editedFalseNext?: string;
  private plugin: GeminiHelperPlugin;

  constructor(
    app: App,
    node: SidebarNode,
    onSave: (node: SidebarNode) => void,
    plugin: GeminiHelperPlugin
  ) {
    super(app);
    this.node = node;
    this.onSave = onSave;
    this.editedProperties = { ...node.properties };
    this.editedNext = node.next;
    this.editedTrueNext = node.trueNext;
    this.editedFalseNext = node.falseNext;
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-node-editor-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with title
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", {
      text: t("nodeEditor.editTitle", { type: getNodeTypeLabel(this.node.type) }),
    });
    this.setupDragHandle(dragHandle, modalEl);

    // Scrollable content area
    const scrollContainer = contentEl.createDiv({ cls: "workflow-node-editor-scroll" });

    new Setting(scrollContainer)
      .setName(t("nodeEditor.nodeType"))
      .setDesc(`ID: ${this.node.id}`)
      .addText((text) => {
        text.setValue(getNodeTypeLabel(this.node.type));
        text.setDisabled(true);
      });

    this.renderPropertyFields(scrollContainer);

    const buttonContainer = contentEl.createDiv({ cls: "workflow-modal-buttons" });

    const saveBtn = buttonContainer.createEl("button", {
      cls: "mod-cta",
      text: t("nodeEditor.save"),
    });
    saveBtn.addEventListener("click", () => void this.save());

    const cancelBtn = buttonContainer.createEl("button", {
      text: t("common.cancel"),
    });
    cancelBtn.addEventListener("click", () => this.close());
  }

  private setupDragHandle(dragHandle: HTMLElement, modalEl: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = modalEl.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      modalEl.setCssStyles({
        position: "fixed",
        margin: "0",
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      modalEl.setCssStyles({
        left: `${startLeft + deltaX}px`,
        top: `${startTop + deltaY}px`,
      });
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    dragHandle.addEventListener("mousedown", onMouseDown);
  }

  private renderPropertyFields(container: HTMLElement): void {
    const isConditional = this.node.type === "if" || this.node.type === "while";
    switch (this.node.type) {
      case "variable":
      case "set":
        this.addTextField(container, "name", t("nodeEditor.variableName"), t("nodeEditor.variableName.placeholder"));
        this.addTextArea(container, "value", t("nodeEditor.value"), t("nodeEditor.value.placeholder"), true);
        break;

      case "if":
      case "while":
        this.addTextArea(
          container,
          "condition",
          t("nodeEditor.condition"),
          t("nodeEditor.condition.placeholder")
        );
        break;

      case "command": {
        this.addTextArea(container, "prompt", t("nodeEditor.prompt"), t("nodeEditor.prompt.placeholder"), true);

        // Build model options based on API plan
        const cliConfig = this.plugin.settings.cliConfig;
        const apiPlan = this.plugin.settings.apiPlan;
        const availableModels = getAvailableModels(apiPlan);

        const modelOptions: Array<{ value: string; label: string }> = [
          { value: "", label: t("nodeEditor.useCurrentModel") },
        ];

        // Add models based on plan
        for (const model of availableModels) {
          modelOptions.push({ value: model.name, label: model.displayName });
        }

        // Add verified CLI models
        if (cliConfig?.cliVerified) {
          modelOptions.push({ value: CLI_MODEL.name, label: CLI_MODEL.displayName });
        }
        if (cliConfig?.claudeCliVerified) {
          modelOptions.push({ value: CLAUDE_CLI_MODEL.name, label: CLAUDE_CLI_MODEL.displayName });
        }
        if (cliConfig?.codexCliVerified) {
          modelOptions.push({ value: CODEX_CLI_MODEL.name, label: CODEX_CLI_MODEL.displayName });
        }

        // Search options (RAG)
        const ragSettingNames = Object.keys(this.plugin.workspaceState.ragSettings || {});
        const searchOptions = [
          { value: "__none__", label: t("nodeEditor.searchNone") },
          { value: "__websearch__", label: t("nodeEditor.webSearch") },
          ...ragSettingNames.map(name => ({ value: name, label: t("nodeEditor.semanticSearch", { name }) })),
        ];

        // Vault tools options
        const vaultToolOptions = [
          { value: "all", label: t("nodeEditor.vaultToolsAll") },
          { value: "noSearch", label: t("nodeEditor.vaultToolsNoSearch") },
          { value: "none", label: t("nodeEditor.vaultToolsNone") },
        ];

        const isCliModel = (model: string) => model === "gemini-cli" || model === "claude-cli" || model === "codex-cli";

        let searchDropdown: HTMLSelectElement | null = null;
        let vaultToolDropdown: HTMLSelectElement | null = null;
        const mcpCheckboxes: Array<{ name: string; checkbox: HTMLInputElement }> = [];

        // Model dropdown
        new Setting(container).setName(t("nodeEditor.model")).addDropdown((dropdown) => {
          for (const opt of modelOptions) {
            dropdown.addOption(opt.value, opt.label);
          }
          dropdown.setValue(this.editedProperties["model"] || "");
          dropdown.onChange((value) => {
            this.editedProperties["model"] = value;
            // Auto-disable tools for CLI models
            if (isCliModel(value)) {
              this.editedProperties["ragSetting"] = "__none__";
              this.editedProperties["vaultTools"] = "none";
              this.editedProperties["mcpServers"] = "";
              if (searchDropdown) {
                searchDropdown.value = "__none__";
                searchDropdown.disabled = true;
              }
              if (vaultToolDropdown) {
                vaultToolDropdown.value = "none";
                vaultToolDropdown.disabled = true;
              }
              for (const { checkbox } of mcpCheckboxes) {
                checkbox.checked = false;
                checkbox.disabled = true;
              }
            } else {
              if (searchDropdown) searchDropdown.disabled = false;
              if (vaultToolDropdown) vaultToolDropdown.disabled = false;
              for (const { checkbox } of mcpCheckboxes) {
                checkbox.disabled = false;
              }
            }
          });
        });

        // Search dropdown
        const initialModel = this.editedProperties["model"] || "";
        new Setting(container).setName(t("nodeEditor.search")).addDropdown((dropdown) => {
          searchDropdown = dropdown.selectEl;
          for (const opt of searchOptions) {
            dropdown.addOption(opt.value, opt.label);
          }
          if (isCliModel(initialModel)) {
            this.editedProperties["ragSetting"] = "__none__";
            dropdown.setValue("__none__");
            searchDropdown.disabled = true;
          } else {
            dropdown.setValue(this.editedProperties["ragSetting"] || "__none__");
          }
          dropdown.onChange((value) => {
            this.editedProperties["ragSetting"] = value;
          });
        });

        // Vault Tools dropdown
        new Setting(container).setName(t("nodeEditor.vaultTools")).addDropdown((dropdown) => {
          vaultToolDropdown = dropdown.selectEl;
          for (const opt of vaultToolOptions) {
            dropdown.addOption(opt.value, opt.label);
          }
          if (isCliModel(initialModel)) {
            this.editedProperties["vaultTools"] = "none";
            dropdown.setValue("none");
            vaultToolDropdown.disabled = true;
          } else {
            dropdown.setValue(this.editedProperties["vaultTools"] || "all");
          }
          dropdown.onChange((value) => {
            this.editedProperties["vaultTools"] = value;
          });
        });

        // MCP Servers (checkboxes)
        const mcpServers = this.plugin.settings.mcpServers || [];
        if (mcpServers.length > 0) {
          const enabledMcpServers = (this.editedProperties["mcpServers"] || "").split(",").filter(s => s.trim());

          const mcpSetting = new Setting(container).setName(t("nodeEditor.mcpServers"));
          const mcpContainer = mcpSetting.settingEl.createDiv({ cls: "workflow-mcp-checkboxes" });

          for (const server of mcpServers) {
            const label = mcpContainer.createEl("label", { cls: "workflow-mcp-checkbox-label" });
            const checkbox = label.createEl("input", { type: "checkbox" });
            checkbox.checked = enabledMcpServers.includes(server.name);
            checkbox.disabled = isCliModel(initialModel);
            label.createSpan({ text: server.name });

            mcpCheckboxes.push({ name: server.name, checkbox });

            checkbox.addEventListener("change", () => {
              const selected = mcpCheckboxes
                .filter(({ checkbox }) => checkbox.checked)
                .map(({ name }) => name);
              this.editedProperties["mcpServers"] = selected.join(",");
            });
          }
        }

        this.addTextField(container, "attachments", t("nodeEditor.attachments"), t("nodeEditor.attachments.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.placeholder"));
        this.addTextField(container, "saveImageTo", t("nodeEditor.saveImageTo"), t("nodeEditor.saveImageTo.placeholder"));
        break;
      }

      case "http":
        this.addTextField(container, "url", t("nodeEditor.url"), t("nodeEditor.url.placeholder"));
        this.addDropdown(container, "method", t("nodeEditor.method"), ["GET", "POST", "PUT", "DELETE", "PATCH"]);
        this.addDropdown(container, "contentType", t("nodeEditor.contentType"), ["json", "form-data", "text", "binary"], t("nodeEditor.contentType.desc"));
        this.addTextArea(container, "headers", t("nodeEditor.headers"), t("nodeEditor.headers.placeholder"));
        this.addTextArea(container, "body", t("nodeEditor.body"), t("nodeEditor.body.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.httpResponse"));
        this.addTextField(container, "saveStatus", t("nodeEditor.saveStatus"), t("nodeEditor.saveStatus.placeholder"));
        this.addDropdown(container, "throwOnError", t("nodeEditor.throwOnError"), ["false", "true"], t("nodeEditor.throwOnError.desc"));
        break;

      case "json":
        this.addTextField(container, "source", t("nodeEditor.sourceVariable"), t("nodeEditor.sourceVariable.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.placeholder"));
        break;

      case "note":
        this.addTextField(container, "path", t("nodeEditor.notePath"), t("nodeEditor.notePath.placeholder"));
        this.addTextArea(container, "content", t("nodeEditor.content"), t("nodeEditor.content.placeholder"), true);
        this.addDropdown(container, "mode", t("nodeEditor.mode"), ["overwrite", "append", "create"], t("nodeEditor.mode.desc"));
        this.addDropdown(container, "confirm", t("nodeEditor.confirm"), ["true", "false"], t("nodeEditor.confirm.desc"));
        break;

      case "note-read":
        this.addTextField(container, "path", t("nodeEditor.notePathRead"), t("nodeEditor.notePathRead.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.noteContent"));
        break;

      case "note-search":
        this.addTextField(container, "query", t("nodeEditor.searchQuery"), t("nodeEditor.searchQuery.placeholder"));
        this.addDropdown(container, "searchContent", t("nodeEditor.searchType"), ["false", "true"], t("nodeEditor.searchType.desc"));
        this.addTextField(container, "limit", t("nodeEditor.limit"), t("nodeEditor.limit.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.searchResults"));
        break;

      case "note-list":
        this.addTextField(container, "folder", t("nodeEditor.folder"), t("nodeEditor.folder.placeholder"));
        this.addDropdown(container, "recursive", t("nodeEditor.recursive"), ["false", "true"], t("nodeEditor.recursive.desc"));
        this.addTextField(container, "tags", t("nodeEditor.tags"), t("nodeEditor.tags.placeholder"));
        this.addDropdown(container, "tagMatch", t("nodeEditor.tagMatch"), ["any", "all"], t("nodeEditor.tagMatch.desc"));
        this.addTextField(container, "createdWithin", t("nodeEditor.createdWithin"), t("nodeEditor.createdWithin.placeholder"));
        this.addTextField(container, "modifiedWithin", t("nodeEditor.modifiedWithin"), t("nodeEditor.modifiedWithin.placeholder"));
        this.addDropdown(container, "sortBy", t("nodeEditor.sortBy"), ["", "modified", "created", "name"], t("nodeEditor.sortBy.desc"));
        this.addDropdown(container, "sortOrder", t("nodeEditor.sortOrder"), ["desc", "asc"], t("nodeEditor.sortOrder.desc"));
        this.addTextField(container, "limit", t("nodeEditor.limit"), t("nodeEditor.limit.notes"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.noteList"));
        break;

      case "folder-list":
        this.addTextField(container, "folder", t("nodeEditor.parentFolder"), t("nodeEditor.parentFolder.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.folderList"));
        break;

      case "open":
        this.addTextField(container, "path", t("nodeEditor.filePath"), t("nodeEditor.filePath.placeholder"));
        break;

      case "dialog":
        this.addTextField(container, "title", t("nodeEditor.title"), t("nodeEditor.title.placeholder"));
        this.addTextArea(container, "message", t("nodeEditor.message"), t("nodeEditor.message.placeholder"), true);
        this.addDropdown(container, "markdown", t("nodeEditor.renderMarkdown"), ["false", "true"], t("nodeEditor.renderMarkdown.desc"));
        this.addTextField(container, "options", t("nodeEditor.options"), t("nodeEditor.options.placeholder"));
        this.addDropdown(container, "multiSelect", t("nodeEditor.selectionMode"), ["false", "true"], t("nodeEditor.selectionMode.desc"));
        this.addTextField(container, "inputTitle", t("nodeEditor.inputTitle"), t("nodeEditor.inputTitle.placeholder"));
        this.addDropdown(container, "multiline", t("nodeEditor.inputType"), ["false", "true"], t("nodeEditor.inputType.desc"));
        this.addTextField(container, "defaults", t("nodeEditor.defaults"), t("nodeEditor.defaults.placeholder"));
        this.addTextField(container, "button1", t("nodeEditor.button1"), t("nodeEditor.button1.placeholder"));
        this.addTextField(container, "button2", t("nodeEditor.button2"), t("nodeEditor.button2.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.dialogResult"));
        break;

      case "prompt-file":
        this.addTextField(container, "title", t("nodeEditor.dialogTitle"), t("nodeEditor.dialogTitle.file"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveContentTo"), t("nodeEditor.saveContentTo.placeholder"));
        this.addTextField(container, "saveFileTo", t("nodeEditor.saveFileTo"), t("nodeEditor.saveFileTo.placeholder"));
        break;

      case "prompt-selection":
        this.addTextField(container, "title", t("nodeEditor.dialogTitle"), t("nodeEditor.dialogTitle.selection"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTextTo"), t("nodeEditor.saveTextTo.placeholder"));
        this.addTextField(container, "saveSelectionTo", t("nodeEditor.saveSelectionTo"), t("nodeEditor.saveSelectionTo.placeholder"));
        break;

      case "file-explorer":
        this.addDropdown(container, "mode", t("nodeEditor.fileExplorerMode"), ["select", "create"], t("nodeEditor.fileExplorerMode.desc"));
        this.addTextField(container, "title", t("nodeEditor.dialogTitle"), t("nodeEditor.dialogTitle.file"));
        this.addTextField(container, "extensions", t("nodeEditor.extensions"), t("nodeEditor.extensions.placeholder"));
        this.addTextField(container, "default", t("nodeEditor.defaultPath"), t("nodeEditor.defaultPath.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveDataTo"), t("nodeEditor.saveDataTo.placeholder"));
        this.addTextField(container, "savePathTo", t("nodeEditor.savePathTo"), t("nodeEditor.savePathTo.placeholder"));
        break;

      case "workflow":
        this.addTextField(container, "path", t("nodeEditor.workflowPath"), t("nodeEditor.workflowPath.placeholder"));
        this.addTextField(container, "name", t("nodeEditor.workflowName"), t("nodeEditor.workflowName.placeholder"));
        this.addTextArea(container, "input", t("nodeEditor.inputVariables"), t("nodeEditor.inputVariables.placeholder"));
        this.addTextArea(container, "output", t("nodeEditor.outputVariables"), t("nodeEditor.outputVariables.placeholder"));
        this.addTextField(container, "prefix", t("nodeEditor.prefix"), t("nodeEditor.prefix.placeholder"));
        break;

      case "rag-sync": {
        this.addTextField(container, "path", t("nodeEditor.ragNotePath"), t("nodeEditor.ragNotePath.placeholder"));
        this.addTextField(container, "oldPath", t("nodeEditor.ragOldPath"), t("nodeEditor.ragOldPath.placeholder"));
        const ragNames = Object.keys(this.plugin.workspaceState.ragSettings || {});
        this.addLabeledDropdown(container, "ragSetting", t("nodeEditor.ragSetting"), [
          { value: "", label: t("nodeEditor.ragSetting.select") },
          ...ragNames.map((name: string) => ({ value: name, label: name })),
        ]);
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.ragResult"));
        break;
      }

      case "file-save":
        this.addTextField(container, "source", t("nodeEditor.fileSaveSource"), t("nodeEditor.fileSaveSource.placeholder"));
        this.addTextField(container, "path", t("nodeEditor.fileSavePath"), t("nodeEditor.fileSavePath.placeholder"));
        this.addTextField(container, "savePathTo", t("nodeEditor.fileSavePathTo"), t("nodeEditor.fileSavePathTo.placeholder"));
        break;

      case "mcp":
        this.addTextField(container, "url", t("nodeEditor.mcpUrl"), t("nodeEditor.mcpUrl.placeholder"));
        this.addTextField(container, "tool", t("nodeEditor.mcpTool"), t("nodeEditor.mcpTool.placeholder"));
        this.addTextArea(container, "args", t("nodeEditor.mcpArgs"), t("nodeEditor.mcpArgs.placeholder"));
        this.addTextArea(container, "headers", t("nodeEditor.mcpHeaders"), t("nodeEditor.mcpHeaders.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.mcpResult"));
        break;

      case "obsidian-command":
        this.addTextField(container, "command", t("nodeEditor.commandId"), t("nodeEditor.commandId.placeholder"));
        this.addTextField(container, "path", t("nodeEditor.commandFilePath"), t("nodeEditor.commandFilePath.placeholder"));
        this.addTextField(container, "saveTo", t("nodeEditor.saveTo"), t("nodeEditor.saveTo.commandResult"));
        break;

      case "sleep":
        this.addTextField(container, "duration", t("nodeEditor.duration"), t("nodeEditor.duration.placeholder"));
        break;
    }

    if (isConditional) {
      this.addLinkField(container, "trueNext", t("nodeEditor.trueNext"), t("nodeEditor.trueNext.placeholder"));
      this.addLinkField(container, "falseNext", t("nodeEditor.falseNext"), t("nodeEditor.falseNext.placeholder"));
    } else {
      this.addLinkField(container, "next", t("nodeEditor.nextNode"), t("nodeEditor.nextNode.placeholder"));
    }
  }

  private addTextField(
    container: HTMLElement,
    key: string,
    name: string,
    placeholder: string,
    enablePathCompletion = false
  ): void {
    const setting = new Setting(container).setName(name).addText((text) => {
      text.setPlaceholder(placeholder);
      text.setValue(this.editedProperties[key] || "");
      text.onChange((value) => {
        this.editedProperties[key] = value;
      });

      if (enablePathCompletion) {
        this.setupPathCompletion(text.inputEl, setting.settingEl, key);
      }
    });
  }

  private addTextArea(
    container: HTMLElement,
    key: string,
    name: string,
    placeholder: string,
    enablePathCompletion = false
  ): void {
    const setting = new Setting(container).setName(name);
    let textAreaEl: HTMLTextAreaElement | null = null;
    setting.addTextArea((text) => {
      text.setPlaceholder(placeholder);
      text.setValue(this.editedProperties[key] || "");
      text.onChange((value) => {
        this.editedProperties[key] = value;
      });
      text.inputEl.rows = 3;
      text.inputEl.addClass("workflow-node-editor-textarea");
      textAreaEl = text.inputEl;
    });
    if (enablePathCompletion && textAreaEl) {
      this.setupPathCompletion(textAreaEl, setting.settingEl, key);
    }
  }

  private addDropdown(
    container: HTMLElement,
    key: string,
    name: string,
    options: string[],
    desc?: string
  ): void {
    const setting = new Setting(container).setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
    setting.addDropdown((dropdown) => {
      for (const opt of options) {
        dropdown.addOption(opt, opt);
      }
      dropdown.setValue(this.editedProperties[key] || options[0]);
      dropdown.onChange((value) => {
        this.editedProperties[key] = value;
      });
    });
  }

  private addLabeledDropdown(
    container: HTMLElement,
    key: string,
    name: string,
    options: { value: string; label: string }[],
    desc?: string
  ): void {
    const setting = new Setting(container).setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
    setting.addDropdown((dropdown) => {
      for (const opt of options) {
        dropdown.addOption(opt.value, opt.label);
      }
      dropdown.setValue(this.editedProperties[key] || options[0]?.value || "");
      dropdown.onChange((value) => {
        this.editedProperties[key] = value;
      });
    });
  }

  private addLinkField(
    container: HTMLElement,
    key: "next" | "trueNext" | "falseNext",
    name: string,
    placeholder: string
  ): void {
    const currentValue =
      key === "next"
        ? this.editedNext
        : key === "trueNext"
          ? this.editedTrueNext
          : this.editedFalseNext;

    new Setting(container).setName(name).addText((text) => {
      text.setPlaceholder(placeholder);
      text.setValue(currentValue || "");
      text.onChange((value) => {
        if (key === "next") this.editedNext = value;
        if (key === "trueNext") this.editedTrueNext = value;
        if (key === "falseNext") this.editedFalseNext = value;
      });
    });
  }

  private setupPathCompletion(
    inputEl: HTMLInputElement | HTMLTextAreaElement,
    containerEl: HTMLElement,
    key: string
  ): void {
    let suggestionContainer: HTMLDivElement | null = null;
    let selectedIndex = 0;
    let currentSuggestions: PathSuggestion[] = [];
    let atStartPos = -1;

    const hideSuggestions = () => {
      if (suggestionContainer) {
        suggestionContainer.remove();
        suggestionContainer = null;
      }
      currentSuggestions = [];
      selectedIndex = 0;
      atStartPos = -1;
    };

    const showSuggestions = (suggestions: PathSuggestion[]) => {
      hideSuggestions();
      if (suggestions.length === 0) return;

      currentSuggestions = suggestions;
      suggestionContainer = document.createElement("div");
      suggestionContainer.addClass("workflow-path-suggestions");

      suggestions.forEach((suggestion, index) => {
        const item = document.createElement("div");
        item.addClass("workflow-path-suggestion-item");
        if (index === selectedIndex) {
          item.addClass("is-selected");
        }
        item.textContent = suggestion.display;
        item.addEventListener("click", () => {
          selectSuggestion(index);
        });
        item.addEventListener("mouseenter", () => {
          selectedIndex = index;
          updateSelection();
        });
        suggestionContainer!.appendChild(item);
      });

      containerEl.appendChild(suggestionContainer);
    };

    const updateSelection = () => {
      if (!suggestionContainer) return;
      const items = suggestionContainer.querySelectorAll(".workflow-path-suggestion-item");
      items.forEach((item, index) => {
        if (index === selectedIndex) {
          item.addClass("is-selected");
        } else {
          item.removeClass("is-selected");
        }
      });
    };

    const selectSuggestion = (index: number) => {
      const suggestion = currentSuggestions[index];
      if (!suggestion) return;

      const value = inputEl.value;
      // Format path with quotes if it contains spaces
      const pathStr = suggestion.path.includes(" ")
        ? `@"${suggestion.path}"`
        : `@${suggestion.path}`;

      // Replace @query with the selected path
      const before = value.substring(0, atStartPos);
      const cursorPos = inputEl.selectionStart || value.length;
      const after = value.substring(cursorPos);

      inputEl.value = before + pathStr + " " + after;
      this.editedProperties[key] = inputEl.value;

      // Set cursor position after the inserted path
      const newPos = before.length + pathStr.length + 1;
      inputEl.setSelectionRange(newPos, newPos);
      inputEl.focus();

      hideSuggestions();
    };

    inputEl.addEventListener("input", () => {
      const value = inputEl.value;
      const cursorPos = inputEl.selectionStart || 0;
      const textBeforeCursor = value.substring(0, cursorPos);

      // Check for @ trigger - match @query pattern (non-quoted) or @"query (partial quote)
      const atMatch = textBeforeCursor.match(/@"([^"]*$)|@([^\s@"]*)$/);
      if (atMatch) {
        const query = atMatch[1] || atMatch[2] || "";
        atStartPos = cursorPos - atMatch[0].length;
        const suggestions = buildPathSuggestions(this.app, query);
        showSuggestions(suggestions);
      } else {
        hideSuggestions();
      }
    });

    inputEl.addEventListener("keydown", (evt) => {
      if (!suggestionContainer || currentSuggestions.length === 0) return;

      const e = evt as KeyboardEvent;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
        updateSelection();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSelection();
      } else if (e.key === "Tab" || e.key === "Enter") {
        if (currentSuggestions.length > 0) {
          e.preventDefault();
          selectSuggestion(selectedIndex);
        }
      } else if (e.key === "Escape") {
        hideSuggestions();
      }
    });

    inputEl.addEventListener("blur", () => {
      // Delay to allow click events on suggestions
      setTimeout(() => hideSuggestions(), 200);
    });
  }

  private async save(): Promise<void> {
    // Expand @path references in all text properties
    const expandedProperties: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.editedProperties)) {
      expandedProperties[key] = await expandPathReferences(this.app, value);
    }

    const updatedNode: SidebarNode = {
      ...this.node,
      properties: expandedProperties,
      next: this.editedNext?.trim() || undefined,
      trueNext: this.editedTrueNext?.trim() || undefined,
      falseNext: this.editedFalseNext?.trim() || undefined,
    };
    this.onSave(updatedNode);
    this.close();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
