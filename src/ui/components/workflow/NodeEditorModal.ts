import { App, Modal, Setting } from "obsidian";
import { SidebarNode, WorkflowNodeType } from "src/workflow/types";

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
  workflow: "Workflow",
};

export class NodeEditorModal extends Modal {
  private node: SidebarNode;
  private onSave: (node: SidebarNode) => void;
  private editedProperties: Record<string, string>;
  private editedNext?: string;
  private editedTrueNext?: string;
  private editedFalseNext?: string;
  private ragSettingNames: string[];

  constructor(
    app: App,
    node: SidebarNode,
    onSave: (node: SidebarNode) => void,
    ragSettingNames: string[] = []
  ) {
    super(app);
    this.node = node;
    this.onSave = onSave;
    this.editedProperties = { ...node.properties };
    this.editedNext = node.next;
    this.editedTrueNext = node.trueNext;
    this.editedFalseNext = node.falseNext;
    this.ragSettingNames = ragSettingNames;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-node-editor-modal");

    contentEl.createEl("h2", {
      text: `Edit ${NODE_TYPE_LABELS[this.node.type]} node`,
    });

    new Setting(contentEl)
      .setName("Node type")
      .setDesc(`ID: ${this.node.id}`)
      .addText((text) => {
        text.setValue(NODE_TYPE_LABELS[this.node.type]);
        text.setDisabled(true);
      });

    this.renderPropertyFields(contentEl);

    const buttonContainer = contentEl.createDiv({ cls: "workflow-modal-buttons" });

    const saveBtn = buttonContainer.createEl("button", {
      cls: "mod-cta",
      text: "Save",
    });
    saveBtn.addEventListener("click", () => this.save());

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", () => this.close());
  }

  private renderPropertyFields(container: HTMLElement): void {
    const isConditional = this.node.type === "if" || this.node.type === "while";
    switch (this.node.type) {
      case "variable":
      case "set":
        this.addTextField(container, "name", "Variable Name", "Enter variable name");
        this.addTextArea(container, "value", "Value", "Enter value or expression (e.g., {{var}} + 1)");
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

      case "command":
        this.addTextArea(container, "prompt", "Prompt", "Enter prompt template (supports {{variables}})");
        this.addLabeledDropdown(container, "model", "Model", [
          { value: "", label: "Use current model" },
          { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
          { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
          { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
          { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
          { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
        ]);
        this.addLabeledDropdown(container, "ragSetting", "Search", [
          { value: "__none__", label: "None" },
          { value: "__websearch__", label: "Web search" },
          ...this.ragSettingNames.map(name => ({ value: name, label: `Semantic search: ${name}` })),
        ]);
        this.addTextField(container, "saveTo", "Save To", "Variable name to store result");
        break;

      case "http":
        this.addTextField(container, "url", "URL", "https://api.example.com/endpoint");
        this.addDropdown(container, "method", "Method", ["GET", "POST", "PUT", "DELETE", "PATCH"]);
        this.addTextArea(container, "headers", "Headers (JSON)", '{"Authorization": "Bearer {{token}}"}');
        this.addTextArea(container, "body", "Body (JSON)", '{"key": "{{value}}"}');
        this.addTextField(container, "saveTo", "Save To", "Variable name to store response");
        break;

      case "json":
        this.addTextField(container, "source", "Source Variable", "Variable containing JSON string");
        this.addTextField(container, "saveTo", "Save To", "Variable name to store parsed object");
        break;

      case "note":
        this.addTextField(container, "path", "Note Path", "Path to the note file (e.g., output/result.md)");
        this.addTextArea(container, "content", "Content", "Content to write (supports {{variables}})");
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
        this.addTextArea(container, "message", "Message", "Message to display");
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
        this.addTextField(container, "saveTo", "Save To", "Variable name to store file path");
        break;

      case "prompt-selection":
        this.addTextField(container, "title", "Dialog Title", "Select text");
        this.addTextField(container, "saveTo", "Save Text To", "Variable name for selected text");
        this.addTextField(container, "saveSelectionTo", "Save Selection To", "Variable name for selection object");
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
    placeholder: string
  ): void {
    new Setting(container).setName(name).addText((text) => {
      text.setPlaceholder(placeholder);
      text.setValue(this.editedProperties[key] || "");
      text.onChange((value) => {
        this.editedProperties[key] = value;
      });
    });
  }

  private addTextArea(
    container: HTMLElement,
    key: string,
    name: string,
    placeholder: string
  ): void {
    new Setting(container).setName(name).addTextArea((text) => {
      text.setPlaceholder(placeholder);
      text.setValue(this.editedProperties[key] || "");
      text.onChange((value) => {
        this.editedProperties[key] = value;
      });
      text.inputEl.rows = 3;
      text.inputEl.addClass("workflow-node-editor-textarea");
    });
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

  private save(): void {
    const updatedNode: SidebarNode = {
      ...this.node,
      properties: this.editedProperties,
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
