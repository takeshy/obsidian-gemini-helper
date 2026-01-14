import { App, Modal, Notice, Platform, parseYaml, TFile } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { GeminiCliProvider, ClaudeCliProvider, CodexCliProvider } from "src/core/cliProvider";
import { GeminiClient } from "src/core/gemini";
import { CLI_MODEL, CLAUDE_CLI_MODEL, CODEX_CLI_MODEL, DEFAULT_CLI_CONFIG, getAvailableModels, type ModelType } from "src/types";
import { WORKFLOW_SPECIFICATION } from "src/workflow/workflowSpec";
import type { SidebarNode, WorkflowNodeType } from "src/workflow/types";
import { computeLineDiff } from "./EditConfirmationModal";

export type AIWorkflowMode = "create" | "modify";

export interface ResolvedMention {
  original: string; // e.g., "@notes/file.md"
  content: string;  // The file content
}

export interface AIWorkflowResult {
  yaml: string;
  nodes: SidebarNode[];
  name: string;
  outputPath?: string; // Only for create mode
  explanation?: string; // AI's explanation of changes
  description?: string; // User's original request
  mode?: AIWorkflowMode; // "create" or "modify"
  resolvedMentions?: ResolvedMention[]; // File contents that were embedded
}

// Confirmation modal for reviewing changes
class WorkflowConfirmModal extends Modal {
  private oldYaml: string;
  private newYaml: string;
  private explanation?: string;
  private resolvePromise: (confirmed: boolean) => void;

  constructor(
    app: App,
    oldYaml: string,
    newYaml: string,
    explanation: string | undefined,
    resolvePromise: (confirmed: boolean) => void
  ) {
    super(app);
    this.oldYaml = oldYaml;
    this.newYaml = newYaml;
    this.explanation = explanation;
    this.resolvePromise = resolvePromise;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("ai-workflow-confirm-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with title
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", { text: "Confirm workflow changes" });
    this.setupDragHandle(dragHandle, modalEl);

    // Explanation section (if available)
    if (this.explanation) {
      const explanationContainer = contentEl.createDiv({ cls: "ai-workflow-explanation" });
      explanationContainer.createEl("h3", { text: "AI explanation" });
      explanationContainer.createEl("p", { text: this.explanation });
    }

    // Create diff view
    const diffContainer = contentEl.createDiv({ cls: "gemini-helper-diff-view" });
    const diffLines = computeLineDiff(this.oldYaml, this.newYaml);

    for (const line of diffLines) {
      const lineEl = diffContainer.createDiv({
        cls: `gemini-helper-diff-line gemini-helper-diff-${line.type}`,
      });

      // Line number gutter
      const gutterEl = lineEl.createSpan({ cls: "gemini-helper-diff-gutter" });
      if (line.type === "removed") {
        gutterEl.textContent = "-";
      } else if (line.type === "added") {
        gutterEl.textContent = "+";
      } else {
        gutterEl.textContent = " ";
      }

      // Content
      const contentEl = lineEl.createSpan({ cls: "gemini-helper-diff-content" });
      contentEl.textContent = line.content;
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "ai-workflow-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise(false);
      this.close();
    });

    const applyBtn = buttonContainer.createEl("button", {
      text: "Apply changes",
      cls: "mod-cta",
    });
    applyBtn.addEventListener("click", () => {
      this.resolvePromise(true);
      this.close();
    });
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

      // Set position to fixed for dragging
      modalEl.setCssStyles({
        position: "fixed",
        left: `${startLeft}px`,
        top: `${startTop}px`,
        transform: "none",
        margin: "0",
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      modalEl.setCssStyles({
        left: `${startLeft + dx}px`,
        top: `${startTop + dy}px`,
      });
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    dragHandle.addEventListener("mousedown", onMouseDown);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Helper function to show confirmation modal
function showWorkflowConfirmation(
  app: App,
  oldYaml: string,
  newYaml: string,
  explanation?: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new WorkflowConfirmModal(app, oldYaml, newYaml, explanation, resolve);
    modal.open();
  });
}

// Mention item interface
interface MentionItem {
  value: string;
  description: string;
}

export class AIWorkflowModal extends Modal {
  private plugin: GeminiHelperPlugin;
  private mode: AIWorkflowMode;
  private existingYaml?: string;
  private existingName?: string;
  private resolvePromise: (result: AIWorkflowResult | null) => void;

  private nameInputEl: HTMLInputElement | null = null;
  private outputPathEl: HTMLInputElement | null = null;
  private descriptionEl: HTMLTextAreaElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private confirmCheckbox: HTMLInputElement | null = null;
  private generateBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private isGenerating = false;

  // Mention autocomplete state
  private mentionAutocompleteEl: HTMLElement | null = null;
  private mentionItems: MentionItem[] = [];
  private mentionIndex = 0;
  private mentionStartPos = 0;
  private showingMentionAutocomplete = false;
  private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    app: App,
    plugin: GeminiHelperPlugin,
    mode: AIWorkflowMode,
    resolvePromise: (result: AIWorkflowResult | null) => void,
    existingYaml?: string,
    existingName?: string
  ) {
    super(app);
    this.plugin = plugin;
    this.mode = mode;
    this.existingYaml = existingYaml;
    this.existingName = existingName;
    this.resolvePromise = resolvePromise;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ai-workflow-modal");

    // Title
    const title =
      this.mode === "create"
        ? "Create Workflow with AI"
        : "Modify Workflow with AI";
    contentEl.createEl("h2", { text: title });

    // Name and output path (only for create mode)
    if (this.mode === "create") {
      // Name input
      const nameContainer = contentEl.createDiv({ cls: "ai-workflow-input-row" });
      nameContainer.createEl("label", { text: "Workflow name:" });
      this.nameInputEl = nameContainer.createEl("input", {
        type: "text",
        cls: "ai-workflow-name-input",
        attr: { placeholder: "My workflow" },
      });

      // Output path input
      const pathContainer = contentEl.createDiv({ cls: "ai-workflow-input-row" });
      pathContainer.createEl("label", { text: "Output path:" });
      this.outputPathEl = pathContainer.createEl("input", {
        type: "text",
        cls: "ai-workflow-path-input",
        value: "workflows/{{name}}/main",
        attr: { placeholder: "workflows/{{name}}/main" },
      });
      pathContainer.createEl("div", {
        cls: "ai-workflow-hint",
        text: "Use {{name}} for workflow name. .md extension added automatically.",
      });
    }

    // Description label
    const descLabel =
      this.mode === "create"
        ? "Describe what this workflow should do:"
        : "Describe the modifications you want:";

    contentEl.createEl("label", {
      text: descLabel,
      cls: "ai-workflow-label",
    });

    // Description textarea container (for autocomplete positioning)
    const textareaContainer = contentEl.createDiv({ cls: "ai-workflow-textarea-container" });

    // Mention autocomplete dropdown
    this.mentionAutocompleteEl = textareaContainer.createDiv({
      cls: "gemini-helper-autocomplete ai-workflow-mention-autocomplete is-hidden",
    });

    // Description textarea
    this.descriptionEl = textareaContainer.createEl("textarea", {
      cls: "ai-workflow-textarea",
      attr: {
        placeholder:
          this.mode === "create"
            ? "e.g., Create a workflow that reads a note, summarizes it with AI, and saves the summary to a new file"
            : "e.g., Add a confirmation dialog before writing the file",
        rows: "6",
      },
    });

    // Setup mention autocomplete handlers
    this.setupMentionAutocomplete();

    // Hint for @ mention
    contentEl.createEl("div", {
      cls: "ai-workflow-hint",
      text: "Tip: type @ to insert file references. The file content will be embedded when generating.",
    });

    // Show current workflow for modify mode
    if (this.mode === "modify" && this.existingYaml) {
      const details = contentEl.createEl("details", {
        cls: "ai-workflow-existing",
      });
      details.createEl("summary", { text: "Current workflow" });
      details.createEl("pre", {
        text: this.existingYaml,
        cls: "ai-workflow-yaml-preview",
      });
    }

    // Model selection row
    const modelContainer = contentEl.createDiv({ cls: "ai-workflow-model-row" });
    modelContainer.createEl("label", { text: "Model:" });

    this.modelSelect = modelContainer.createEl("select", {
      cls: "ai-workflow-model-select",
    });

    const cliConfig = this.plugin.settings.cliConfig || DEFAULT_CLI_CONFIG;
    const geminiCliVerified = !Platform.isMobile && cliConfig.cliVerified === true;
    const claudeCliVerified = !Platform.isMobile && cliConfig.claudeCliVerified === true;
    const codexCliVerified = !Platform.isMobile && cliConfig.codexCliVerified === true;
    const baseModels = getAvailableModels(this.plugin.settings.apiPlan);
    const cliModels = [
      ...(geminiCliVerified ? [CLI_MODEL] : []),
      ...(claudeCliVerified ? [CLAUDE_CLI_MODEL] : []),
      ...(codexCliVerified ? [CODEX_CLI_MODEL] : []),
    ];
    const availableModels = [...cliModels, ...baseModels];
    const currentModel = this.plugin.getSelectedModel();

    for (const model of availableModels) {
      // Skip image models
      if (model.isImageModel) continue;

      const option = this.modelSelect.createEl("option", {
        text: model.displayName,
        value: model.name,
      });
      if (model.name === currentModel) {
        option.selected = true;
      }
    }

    // Confirmation checkbox (only for modify mode)
    if (this.mode === "modify") {
      const confirmContainer = contentEl.createDiv({ cls: "ai-workflow-confirm-row" });
      this.confirmCheckbox = confirmContainer.createEl("input", {
        type: "checkbox",
        attr: { id: "ai-workflow-confirm-checkbox" },
      });
      this.confirmCheckbox.checked = true; // Default to checked
      confirmContainer.createEl("label", {
        text: "Confirm changes before applying",
        attr: { for: "ai-workflow-confirm-checkbox" },
      });
    }

    // Status area
    this.statusEl = contentEl.createDiv({ cls: "ai-workflow-status" });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "ai-workflow-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise(null);
      this.close();
    });

    this.generateBtn = buttonContainer.createEl("button", {
      text: this.mode === "create" ? "Generate" : "Modify",
      cls: "mod-cta",
    });
    this.generateBtn.addEventListener("click", () => {
      void this.generate();
    });

    // Focus appropriate field
    if (this.mode === "create") {
      setTimeout(() => this.nameInputEl?.focus(), 50);
    } else {
      setTimeout(() => this.descriptionEl?.focus(), 50);
    }
  }

  private async generate(): Promise<void> {
    if (this.isGenerating) return;

    // Validate name for create mode
    if (this.mode === "create") {
      const name = this.nameInputEl?.value?.trim();
      if (!name) {
        new Notice("Please enter a workflow name");
        return;
      }
    }

    const description = this.descriptionEl?.value?.trim();
    if (!description) {
      new Notice("Please describe what you want the workflow to do");
      return;
    }

    const selectedModel = this.modelSelect?.value as ModelType;
    if (!selectedModel) {
      new Notice("Please select a model");
      return;
    }

    const isGeminiCli = selectedModel === "gemini-cli";
    const isClaudeCli = selectedModel === "claude-cli";
    const isCodexCli = selectedModel === "codex-cli";
    const isCliModel = isGeminiCli || isClaudeCli || isCodexCli;

    // Check API key (skip for CLI model)
    if (!isCliModel && !this.plugin.settings.googleApiKey) {
      new Notice("API key is not configured");
      return;
    }

    this.isGenerating = true;
    this.generateBtn!.disabled = true;
    this.generateBtn!.textContent = "Generating...";
    this.statusEl!.textContent = "Generating workflow...";

    // Disable textarea during generation
    if (this.descriptionEl) {
      this.descriptionEl.disabled = true;
    }

    try {
      // Get name for create mode
      const workflowName = this.mode === "create"
        ? this.nameInputEl?.value?.trim() || "workflow"
        : undefined;

      // Resolve @ mentions (embed file content, selection, etc.)
      const { resolved: resolvedDescription, mentions: resolvedMentions } = await this.resolveMentions(description);

      // Show expanded content in textarea
      if (this.descriptionEl && resolvedMentions.length > 0) {
        this.descriptionEl.value = resolvedDescription;
      }

      // Build prompts
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(resolvedDescription, workflowName);

      let response = "";
      if (isCliModel) {
        const cliConfig = this.plugin.settings.cliConfig || DEFAULT_CLI_CONFIG;

        // Select appropriate CLI provider
        let provider: GeminiCliProvider | ClaudeCliProvider | CodexCliProvider;
        if (isClaudeCli) {
          if (!cliConfig.claudeCliVerified) {
            throw new Error("Claude CLI is not available. Please verify it in settings.");
          }
          provider = new ClaudeCliProvider();
        } else if (isCodexCli) {
          if (!cliConfig.codexCliVerified) {
            throw new Error("Codex CLI is not available. Please verify it in settings.");
          }
          provider = new CodexCliProvider();
        } else {
          if (!cliConfig.cliVerified) {
            throw new Error("Gemini CLI is not available. Please verify it in settings.");
          }
          provider = new GeminiCliProvider();
        }

        const vaultBasePath =
          (this.plugin.app.vault.adapter as unknown as { basePath?: string }).basePath || ".";
        const cliSystemPrompt = `${systemPrompt}\n\nNote: You are running in CLI mode with limited capabilities. You can read and search vault files, but cannot modify them.`;

        for await (const chunk of provider.chatStream(
          [{ role: "user", content: userPrompt, timestamp: Date.now() }],
          cliSystemPrompt,
          vaultBasePath
        )) {
          if (chunk.type === "text") {
            response += chunk.content || "";
          } else if (chunk.type === "error") {
            throw new Error(chunk.error || "Unknown error");
          }
        }
      } else {
        // Create Gemini client
        const client = new GeminiClient(
          this.plugin.settings.googleApiKey,
          selectedModel
        );

        // Generate
        response = await client.chat(
          [{ role: "user", content: userPrompt, timestamp: Date.now() }],
          systemPrompt
        );
      }

      // Parse the response
      const result = this.parseResponse(response);

      if (result) {
        // Add description, mode, and resolved mentions to result
        result.description = description;
        result.mode = this.mode;
        result.resolvedMentions = resolvedMentions.length > 0 ? resolvedMentions : undefined;

        // Override name with user input for create mode
        if (this.mode === "create" && workflowName) {
          result.name = workflowName;

          // Calculate output path
          const outputPathTemplate = this.outputPathEl?.value?.trim() || "workflows/{{name}}/main";
          result.outputPath = outputPathTemplate.replace(/\{\{name\}\}/g, workflowName);
        }

        // Check if confirmation is needed (modify mode with checkbox checked)
        const needsConfirmation =
          this.mode === "modify" &&
          this.confirmCheckbox?.checked &&
          this.existingYaml;

        if (needsConfirmation) {
          this.statusEl!.textContent = "Waiting for confirmation...";
          const confirmed = await showWorkflowConfirmation(
            this.app,
            this.existingYaml!,
            result.yaml,
            result.explanation
          );

          if (confirmed) {
            this.statusEl!.textContent = "Workflow modified successfully!";
            this.resolvePromise(result);
            this.close();
          } else {
            // User cancelled - reset state
            this.statusEl!.textContent = "Changes cancelled. You can try again.";
            this.isGenerating = false;
            this.generateBtn!.disabled = false;
            this.generateBtn!.textContent = "Modify";
            if (this.descriptionEl) this.descriptionEl.disabled = false;
          }
        } else {
          this.statusEl!.textContent = "Workflow generated successfully!";
          this.resolvePromise(result);
          this.close();
        }
      } else {
        this.statusEl!.textContent =
          "Failed to parse generated workflow. Please try again.";
        this.isGenerating = false;
        this.generateBtn!.disabled = false;
        this.generateBtn!.textContent =
          this.mode === "create" ? "Generate" : "Modify";
        if (this.descriptionEl) this.descriptionEl.disabled = false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusEl!.textContent = `Error: ${message}`;
      this.isGenerating = false;
      this.generateBtn!.disabled = false;
      this.generateBtn!.textContent =
        this.mode === "create" ? "Generate" : "Modify";
      if (this.descriptionEl) this.descriptionEl.disabled = false;
    }
  }

  private buildSystemPrompt(): string {
    return `You are a workflow generator for Obsidian. You create and modify workflows in YAML format.

${WORKFLOW_SPECIFICATION}

IMPORTANT RULES:
1. Output ONLY the workflow YAML, no explanation or markdown code fences
2. The YAML must be valid and parseable
3. Include a descriptive "name" field
4. Use unique, descriptive node IDs (e.g., "read-input", "process-data", "save-result")
5. Ensure all variables are initialized before use
6. Use proper control flow (next, trueNext, falseNext)
7. Start output directly with "name:" - no code fences, no explanation`;
  }

  private buildUserPrompt(description: string, workflowName?: string): string {
    if (this.mode === "create") {
      return `Create a new workflow named "${workflowName}" that does the following:

${description}

Output only the YAML for the workflow, starting with "name: ${workflowName}".`;
    } else {
      return `Modify the following workflow according to these requirements:

CURRENT WORKFLOW:
${this.existingYaml}

MODIFICATIONS REQUESTED:
${description}

Output only the complete modified YAML, starting with "name:".`;
    }
  }

  /**
   * Strip YAML frontmatter from file content
   */
  private stripFrontmatter(content: string): string {
    // Match YAML frontmatter: starts with ---, ends with ---
    const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
    return content.replace(frontmatterRegex, "").trim();
  }

  private async resolveMentions(text: string): Promise<{ resolved: string; mentions: ResolvedMention[] }> {
    let resolved = text;
    const mentions: ResolvedMention[] = [];

    // Find all @ mentions: @{selection}, @{content}, @filepath
    const mentionRegex = /@(\{selection\}|\{content\}|[^\s@]+)/g;
    const matches = [...text.matchAll(mentionRegex)];

    for (const match of matches) {
      const mention = match[1];
      let replacement = match[0]; // Keep original if resolution fails
      let content: string | null = null;

      if (mention === "{selection}") {
        // Get selected text from editor
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor && editor.somethingSelected()) {
          content = editor.getSelection();
          replacement = `[Selected text]\n${content}\n[/Selected text]`;
        }
      } else if (mention === "{content}") {
        // Get content of active note
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          const rawContent = await this.app.vault.read(activeFile);
          content = this.stripFrontmatter(rawContent);
          replacement = `[Content of ${activeFile.path}]\n${content}\n[/Content]`;
        }
      } else {
        // It's a file path - try to read the file
        const file = this.app.vault.getAbstractFileByPath(mention);
        if (file instanceof TFile) {
          try {
            const rawContent = await this.app.vault.read(file);
            content = this.stripFrontmatter(rawContent);
            replacement = `[Content of ${mention}]\n${content}\n[/Content]`;
          } catch {
            // Keep original mention if file can't be read
          }
        }
      }

      if (content !== null) {
        mentions.push({ original: match[0], content });
      }

      resolved = resolved.replace(match[0], replacement);
    }

    return { resolved, mentions };
  }

  private parseResponse(response: string): AIWorkflowResult | null {
    try {
      let yaml = "";
      let yamlStartIdx = -1;

      // Try to find a code block containing "name:" and "nodes:"
      const codeBlockRegex = /```\w*\s*([\s\S]*?)```/g;
      let match;
      while ((match = codeBlockRegex.exec(response)) !== null) {
        const content = match[1].trim();
        if (content.includes("name:") && content.includes("nodes:")) {
          yaml = content;
          yamlStartIdx = match.index;
          break;
        }
      }

      // If no valid code block found, try to find YAML directly in response
      if (!yaml) {
        const nameMatch = response.match(/(?:^|\n)(name:\s*\S+[\s\S]*?nodes:\s*[\s\S]*?)(?:\n```|$)/);
        if (nameMatch && nameMatch.index !== undefined) {
          yaml = nameMatch[1].trim();
          yamlStartIdx = nameMatch.index;
        }
      }

      // Final fallback: find "name:" and take everything from there
      if (!yaml) {
        const startIdx = response.indexOf("name:");
        if (startIdx >= 0) {
          yaml = response.substring(startIdx).trim();
          // Remove trailing code fence if present
          yaml = yaml.replace(/\n```\s*$/, "").trim();
          yamlStartIdx = startIdx;
        }
      }

      if (!yaml) {
        console.error("Could not find valid workflow YAML in response:", response);
        return null;
      }

      // Extract explanation (text before YAML)
      let explanation = "";
      if (yamlStartIdx > 0) {
        explanation = response.substring(0, yamlStartIdx).trim();
        // Remove code fence markers from explanation
        explanation = explanation.replace(/```\w*\s*$/gm, "").trim();
      }

      // Parse YAML
      const parsed = parseYaml(yaml) as {
        name?: string;
        nodes?: Array<{
          id?: string;
          type?: string;
          next?: string;
          trueNext?: string;
          falseNext?: string;
          [key: string]: unknown;
        }>;
      };

      if (!parsed || !Array.isArray(parsed.nodes)) {
        console.error("Invalid workflow structure:", parsed);
        return null;
      }

      // Convert to SidebarNode format
      const nodes: SidebarNode[] = parsed.nodes.map((node, index) => {
        const { id, type, next, trueNext, falseNext, ...properties } = node;

        // Convert all properties to strings
        const stringProps: Record<string, string> = {};
        for (const [key, value] of Object.entries(properties)) {
          if (value === null || value === undefined) {
            stringProps[key] = "";
          } else if (typeof value === "object") {
            stringProps[key] = JSON.stringify(value);
          } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            stringProps[key] = String(value);
          } else {
            stringProps[key] = JSON.stringify(value);
          }
        }

        const sidebarNode: SidebarNode = {
          id: String(id || `node-${index + 1}`),
          type: (type || "variable") as WorkflowNodeType,
          properties: stringProps,
        };

        // Add connection properties
        if (next) {
          sidebarNode.next = String(next);
        }
        if (trueNext) {
          sidebarNode.trueNext = String(trueNext);
        }
        if (falseNext) {
          sidebarNode.falseNext = String(falseNext);
        }

        return sidebarNode;
      });

      return {
        yaml,
        nodes,
        name: parsed.name || "AI Generated Workflow",
        explanation: explanation || undefined,
      };
    } catch (error) {
      console.error("Failed to parse AI workflow response:", error, response);
      return null;
    }
  }

  private setupMentionAutocomplete(): void {
    if (!this.descriptionEl || !this.mentionAutocompleteEl) return;

    const textarea = this.descriptionEl;
    const autocomplete = this.mentionAutocompleteEl;

    // Input handler for @ detection
    textarea.addEventListener("input", () => {
      const value = textarea.value;
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = value.substring(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

      if (atMatch) {
        const query = atMatch[1];
        this.mentionStartPos = cursorPos - atMatch[0].length;
        this.mentionItems = this.buildMentionCandidates(query);
        this.mentionIndex = 0;

        if (this.mentionItems.length > 0) {
          this.showingMentionAutocomplete = true;
          this.renderMentionAutocomplete();
          this.positionAutocomplete(textarea, autocomplete);
          autocomplete.removeClass("is-hidden");
        } else {
          this.hideMentionAutocomplete();
        }
      } else {
        this.hideMentionAutocomplete();
      }
    });

    // Keyboard handler
    textarea.addEventListener("keydown", (e) => {
      if (!this.showingMentionAutocomplete) return;

      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        this.mentionIndex = Math.min(this.mentionIndex + 1, this.mentionItems.length - 1);
        this.renderMentionAutocomplete();
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        this.mentionIndex = Math.max(this.mentionIndex - 1, 0);
        this.renderMentionAutocomplete();
        return;
      }
      if (e.key === "Enter" && this.mentionItems.length > 0) {
        e.preventDefault();
        this.selectMention(this.mentionItems[this.mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        this.hideMentionAutocomplete();
        return;
      }
    });

    // Click outside to close (store handler for cleanup)
    this.clickOutsideHandler = (e: MouseEvent) => {
      if (this.showingMentionAutocomplete &&
          !autocomplete.contains(e.target as Node) &&
          e.target !== textarea) {
        this.hideMentionAutocomplete();
      }
    };
    document.addEventListener("click", this.clickOutsideHandler);
  }

  private buildMentionCandidates(query: string): MentionItem[] {
    const hasActiveNote = !!this.app.workspace.getActiveFile();
    const editor = this.app.workspace.activeEditor?.editor;
    const hasSelection = editor ? editor.somethingSelected() : false;

    const variables: MentionItem[] = [
      ...(hasSelection ? [{ value: "{selection}", description: "Selected text in editor" }] : []),
      ...(hasActiveNote ? [{ value: "{content}", description: "Content of active note" }] : []),
    ];

    // Get vault files
    const files = this.app.vault.getMarkdownFiles().map((f) => ({
      value: f.path,
      description: "Vault file",
    }));

    const all = [...variables, ...files];
    if (!query) return all.slice(0, 10);

    const lowerQuery = query.toLowerCase();
    return all.filter((item) => item.value.toLowerCase().includes(lowerQuery)).slice(0, 10);
  }

  private renderMentionAutocomplete(): void {
    if (!this.mentionAutocompleteEl) return;

    this.mentionAutocompleteEl.empty();
    this.mentionItems.forEach((item, index) => {
      const itemEl = this.mentionAutocompleteEl!.createDiv({
        cls: `gemini-helper-autocomplete-item ${index === this.mentionIndex ? "active" : ""}`,
      });
      itemEl.createSpan({
        cls: "gemini-helper-autocomplete-name",
        text: item.value,
      });
      itemEl.createSpan({
        cls: "gemini-helper-autocomplete-desc",
        text: item.description,
      });

      itemEl.addEventListener("click", () => this.selectMention(item));
      itemEl.addEventListener("mouseenter", () => {
        this.mentionIndex = index;
        this.renderMentionAutocomplete();
      });
    });
  }

  private selectMention(mention: MentionItem): void {
    if (!this.descriptionEl) return;

    const textarea = this.descriptionEl;
    const cursorPos = textarea.selectionStart;
    const before = textarea.value.substring(0, this.mentionStartPos);
    const after = textarea.value.substring(cursorPos);
    // Keep @ prefix for later processing (file content embedding)
    const newValue = before + "@" + mention.value + " " + after;

    textarea.value = newValue;
    this.hideMentionAutocomplete();

    // Set cursor position after inserted mention (includes @)
    const newPos = this.mentionStartPos + 1 + mention.value.length + 1;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  }

  private hideMentionAutocomplete(): void {
    this.showingMentionAutocomplete = false;
    if (this.mentionAutocompleteEl) {
      this.mentionAutocompleteEl.addClass("is-hidden");
    }
  }

  private positionAutocomplete(textarea: HTMLTextAreaElement, autocomplete: HTMLElement): void {
    const rect = textarea.getBoundingClientRect();

    // Position above the textarea using fixed positioning
    autocomplete.setCssStyles({
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      bottom: `${window.innerHeight - rect.top + 4}px`,
      top: "auto",
    });
  }

  onClose(): void {
    // Clean up event listener
    if (this.clickOutsideHandler) {
      document.removeEventListener("click", this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Helper function to open the modal
export function promptForAIWorkflow(
  app: App,
  plugin: GeminiHelperPlugin,
  mode: AIWorkflowMode,
  existingYaml?: string,
  existingName?: string
): Promise<AIWorkflowResult | null> {
  return new Promise((resolve) => {
    const modal = new AIWorkflowModal(
      app,
      plugin,
      mode,
      resolve,
      existingYaml,
      existingName
    );
    modal.open();
  });
}
