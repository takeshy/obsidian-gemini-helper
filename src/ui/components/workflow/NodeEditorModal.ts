import { App, Modal, Setting, TFile } from "obsidian";
import { SidebarNode, WorkflowNodeType } from "src/workflow/types";
import { getAvailableModels, CLI_MODEL, CLAUDE_CLI_MODEL, CODEX_CLI_MODEL } from "src/types";
import type { GeminiHelperPlugin } from "src/plugin";

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

const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  variable: "Variable",
  set: "Set",
  if: "If",
  while: "While",
  command: "Command",
  http: "HTTP",
  json: "JSON",
  note: "Note",
  "note-read": "Note Read",
  "note-search": "Note Search",
  "note-list": "Note List",
  "folder-list": "Folder List",
  open: "Open",
  dialog: "Dialog",
  "prompt-file": "Prompt File",
  "prompt-selection": "Prompt Selection",
  "file-explorer": "File Explorer",
  "file-save": "File Save",
  workflow: "Workflow",
  "rag-sync": "RAG Sync",
  mcp: "MCP",
  "obsidian-command": "Obsidian Command",
};

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
      text: `Edit ${NODE_TYPE_LABELS[this.node.type]} node`,
    });
    this.setupDragHandle(dragHandle, modalEl);

    // Scrollable content area
    const scrollContainer = contentEl.createDiv({ cls: "workflow-node-editor-scroll" });

    new Setting(scrollContainer)
      .setName("Node type")
      .setDesc(`ID: ${this.node.id}`)
      .addText((text) => {
        text.setValue(NODE_TYPE_LABELS[this.node.type]);
        text.setDisabled(true);
      });

    this.renderPropertyFields(scrollContainer);

    const buttonContainer = contentEl.createDiv({ cls: "workflow-modal-buttons" });

    const saveBtn = buttonContainer.createEl("button", {
      cls: "mod-cta",
      text: "Save",
    });
    saveBtn.addEventListener("click", () => void this.save());

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel",
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
        this.addTextField(container, "name", "Variable Name", "Enter variable name");
        this.addTextArea(container, "value", "Value", "Enter value or expression (e.g., {{var}} + 1, @file.md)", true);
        break;

      case "if":
      case "while":
        this.addTextArea(
          container,
          "condition",
          "Condition",
          'e.g., {{counter}} < 10, {{status}} == "end"'
        );
        break;

      case "command": {
        this.addTextArea(container, "prompt", "Prompt", "Enter prompt template (supports {{variables}}, @file.md)", true);

        // Build model options based on API plan
        const cliConfig = this.plugin.settings.cliConfig;
        const apiPlan = this.plugin.settings.apiPlan;
        const availableModels = getAvailableModels(apiPlan);

        const modelOptions: Array<{ value: string; label: string }> = [
          { value: "", label: "Use current model" },
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
          { value: "__none__", label: "None" },
          { value: "__websearch__", label: "Web search" },
          ...ragSettingNames.map(name => ({ value: name, label: `Semantic search: ${name}` })),
        ];

        // Vault tools options
        const vaultToolOptions = [
          { value: "all", label: "All (search + read/write)" },
          { value: "noSearch", label: "No search (read/write only)" },
          { value: "none", label: "None" },
        ];

        const isCliModel = (model: string) => model === "gemini-cli" || model === "claude-cli" || model === "codex-cli";

        let searchDropdown: HTMLSelectElement | null = null;
        let vaultToolDropdown: HTMLSelectElement | null = null;
        let mcpCheckboxes: Array<{ name: string; checkbox: HTMLInputElement }> = [];

        // Model dropdown
        new Setting(container).setName("Model").addDropdown((dropdown) => {
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
        new Setting(container).setName("Search").addDropdown((dropdown) => {
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
        new Setting(container).setName("Vault Tools").addDropdown((dropdown) => {
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

          const mcpSetting = new Setting(container).setName("MCP Servers");
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

        this.addTextField(container, "attachments", "Attachments", "Variable names with file data (comma-separated)");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store text result");
        this.addTextField(container, "saveImageTo", "Save Image To", "Variable name to store generated image (for image models)");
        break;
      }

      case "http":
        this.addTextField(container, "url", "URL", "https://api.example.com/endpoint");
        this.addDropdown(container, "method", "Method", ["GET", "POST", "PUT", "DELETE", "PATCH"]);
        this.addDropdown(container, "contentType", "Content Type", ["json", "form-data", "text"], "json: JSON body, form-data: multipart/form-data, text: plain text");
        this.addTextArea(container, "headers", "Headers (JSON)", '{"Authorization": "Bearer {{token}}"}');
        this.addTextArea(container, "body", "Body", '{"key": "{{value}}"}\nFor form-data: {"file:filename.html": "{{content}}"}');
        this.addTextField(container, "saveTo", "Save To", "Variable name to store response");
        this.addTextField(container, "saveStatus", "Save Status To", "Variable name to store HTTP status code");
        this.addDropdown(container, "throwOnError", "Throw on Error", ["false", "true"], "Throw error on 4xx/5xx responses");
        break;

      case "json":
        this.addTextField(container, "source", "Source Variable", "Variable containing JSON string");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store parsed object");
        break;

      case "note":
        this.addTextField(container, "path", "Note Path", "Path to the note file (e.g., output/result.md)");
        this.addTextArea(container, "content", "Content", "Content to write (supports {{variables}}, @file.md)", true);
        this.addDropdown(container, "mode", "Mode", ["overwrite", "append", "create"], "overwrite: replace file, append: add to end, create: only if not exists");
        this.addDropdown(container, "confirm", "Confirm before writing", ["true", "false"], "true: show confirmation dialog, false: write immediately");
        break;

      case "note-read":
        this.addTextField(container, "path", "Note Path", "Path to the note file to read");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store the note content");
        break;

      case "note-search":
        this.addTextField(container, "query", "Search Query", "Text to search for");
        this.addDropdown(container, "searchContent", "Search Type", ["false", "true"], "false: search file names, true: search file contents");
        this.addTextField(container, "limit", "Limit", "Maximum number of results (default: 10)");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store search results (JSON array)");
        break;

      case "note-list":
        this.addTextField(container, "folder", "Folder", "Folder path to list (empty for root)");
        this.addDropdown(container, "recursive", "Recursive", ["false", "true"], "Include subfolders");
        this.addTextField(container, "tags", "Tags", "Filter by tags (comma-separated, e.g., project, todo)");
        this.addDropdown(container, "tagMatch", "Tag Match", ["any", "all"], "any: match any tag, all: match all tags");
        this.addTextField(container, "createdWithin", "Created Within", "e.g., 7d (7 days), 30m (30 min), 2h (2 hours)");
        this.addTextField(container, "modifiedWithin", "Modified Within", "e.g., 1d (1 day), 60m (60 min)");
        this.addDropdown(container, "sortBy", "Sort By", ["", "modified", "created", "name"], "Sort order for results");
        this.addDropdown(container, "sortOrder", "Sort Order", ["desc", "asc"], "Descending or ascending");
        this.addTextField(container, "limit", "Limit", "Maximum number of notes (default: 50)");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store note list (JSON)");
        break;

      case "folder-list":
        this.addTextField(container, "folder", "Parent Folder", "Parent folder path (empty for all folders)");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store folder list (JSON)");
        break;

      case "open":
        this.addTextField(container, "path", "File Path", "Path to the file to open (supports {{variables}})");
        break;

      case "dialog":
        this.addTextField(container, "title", "Title", "Dialog title");
        this.addTextArea(container, "message", "Message", "Message to display (supports @file.md)", true);
        this.addDropdown(container, "markdown", "Render Markdown", ["false", "true"], "Render message as Markdown");
        this.addTextField(container, "options", "Options", "Comma-separated list of checkbox options (optional)");
        this.addDropdown(container, "multiSelect", "Selection Mode", ["false", "true"], "Single select / Multi select");
        this.addTextField(container, "inputTitle", "Input Title", "Text input label (leave empty to hide input field)");
        this.addDropdown(container, "multiline", "Input Type", ["false", "true"], "Single line / Multi-line text area");
        this.addTextField(container, "defaults", "Defaults", 'JSON: {"input": "text", "selected": ["opt1"]}');
        this.addTextField(container, "button1", "Button 1", "Primary button label (default: OK)");
        this.addTextField(container, "button2", "Button 2", "Secondary button label (optional, for confirm dialogs)");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store result (JSON)");
        break;

      case "prompt-file":
        this.addTextField(container, "title", "Dialog Title", "Select a file");
        this.addTextField(container, "saveTo", "Save Content To", "Variable name for file content");
        this.addTextField(container, "saveFileTo", "Save File Info To", "Variable name for file info (path, basename, name, extension)");
        break;

      case "prompt-selection":
        this.addTextField(container, "title", "Dialog Title", "Select text");
        this.addTextField(container, "saveTo", "Save Text To", "Variable name for selected text");
        this.addTextField(container, "saveSelectionTo", "Save Selection To", "Variable name for selection object");
        break;

      case "file-explorer":
        this.addDropdown(container, "mode", "Mode", ["select", "create"], "select: Pick existing file, create: Enter new path");
        this.addTextField(container, "title", "Dialog Title", "Select a file");
        this.addTextField(container, "extensions", "Extensions", "Allowed extensions (e.g., md,pdf,png)");
        this.addTextField(container, "default", "Default Path", "Default path or folder");
        this.addTextField(container, "saveTo", "Save Data To", "Variable for file data JSON (with content)");
        this.addTextField(container, "savePathTo", "Save Path To", "Variable for file path only");
        break;

      case "workflow":
        this.addTextField(container, "path", "Workflow Path", "Path to workflow file");
        this.addTextField(container, "name", "Workflow Name", "Name of workflow (if file has multiple)");
        this.addTextArea(container, "input", "Input Variables", 'JSON mapping: {"subVar": "{{parentVar}}"}');
        this.addTextArea(container, "output", "Output Variables", 'JSON mapping: {"parentVar": "subVar"}');
        this.addTextField(container, "prefix", "Prefix", "Prefix for imported variables");
        break;

      case "rag-sync": {
        this.addTextField(container, "path", "Note Path", "Path to note to sync (supports {{variables}})");
        const ragNames = Object.keys(this.plugin.workspaceState.ragSettings || {});
        this.addLabeledDropdown(container, "ragSetting", "RAG Setting", [
          { value: "", label: "Select RAG setting" },
          ...ragNames.map((name: string) => ({ value: name, label: name })),
        ]);
        this.addTextField(container, "saveTo", "Save To", "Variable name to store result (optional)");
        break;
      }

      case "file-save":
        this.addTextField(container, "source", "Source Variable", "Variable containing FileExplorerData (e.g., from file-explorer or saveImageTo)");
        this.addTextField(container, "path", "Save Path", "Path to save the file (without extension if auto-detected)");
        this.addTextField(container, "savePathTo", "Save Path To", "Variable to store final file path (optional)");
        break;

      case "mcp":
        this.addTextField(container, "url", "URL", "MCP server endpoint URL (e.g., http://localhost:8080)");
        this.addTextField(container, "tool", "Tool", "Tool name to call on the MCP server");
        this.addTextArea(container, "args", "Arguments", "JSON object with tool arguments (supports {{variables}})");
        this.addTextArea(container, "headers", "Headers", "JSON object with HTTP headers (e.g., for authentication)");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store result (optional)");
        break;

      case "obsidian-command":
        this.addTextField(container, "command", "Command ID", "Obsidian command ID (e.g., editor:toggle-fold, app:reload)");
        this.addTextField(container, "path", "File Path", "File to open before command (optional, tab closes after)");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store execution result (optional)");
        break;
    }

    if (isConditional) {
      this.addLinkField(container, "trueNext", "True Next", "Next node ID for true branch");
      this.addLinkField(container, "falseNext", "False Next", "Next node ID for false branch (optional)");
    } else {
      this.addLinkField(container, "next", "Next Node", "Optional next node ID");
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
