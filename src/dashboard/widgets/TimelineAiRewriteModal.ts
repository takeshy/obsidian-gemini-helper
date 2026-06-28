import { App, Modal, Notice, setIcon } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { GeminiClient } from "src/core/gemini";
import { getAvailableModels, type Message, type ModelType, type StreamChunk } from "src/types";
import { t } from "src/i18n";
import { renderDiffView, createDiffViewToggle, type DiffRendererState } from "src/ui/components/workflow/DiffRenderer";

interface TimelineAiRewriteModalOptions {
  content: string;
  onApply: (content: string) => void;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return (fence ? fence[1] : trimmed).trim();
}

async function collectText(stream: AsyncGenerator<StreamChunk>): Promise<string> {
  let out = "";
  for await (const chunk of stream) {
    if (chunk.type === "text" && chunk.content) out += chunk.content;
    else if (chunk.type === "error") throw new Error(chunk.error || "Generation failed");
  }
  return out;
}

async function generateRewrite(
  plugin: GeminiHelperPlugin,
  model: ModelType,
  content: string,
  instruction: string,
): Promise<string> {
  if (!plugin.settings.googleApiKey) throw new Error(t("chat.configApiKey"));
  const client = new GeminiClient(plugin.settings.googleApiKey, model);
  const systemPrompt = [
    "You rewrite a single Obsidian Timeline post draft.",
    "Return only the rewritten Markdown body.",
    "Do not include explanations, headings about the task, or Markdown code fences.",
    "Preserve image embeds, wikilinks, hashtags, and user-provided facts unless the instruction explicitly changes them.",
  ].join("\n");
  const userPrompt = [
    "Rewrite this Timeline post draft according to the instruction.",
    "",
    `Instruction:\n${instruction}`,
    "",
    "Current draft:",
    "```markdown",
    content,
    "```",
  ].join("\n");
  const messages: Message[] = [{ role: "user", content: userPrompt, timestamp: Date.now() }];
  const raw = await collectText(client.chatWithToolsStream(
    messages,
    [],
    systemPrompt,
    undefined,
    undefined,
    false,
    { enableThinking: true, traceId: null },
  ));
  const rewritten = stripCodeFence(raw);
  if (!rewritten) throw new Error(t("dashboard.timelineAiEmpty"));
  return rewritten;
}

export class TimelineAiRewriteModal extends Modal {
  private plugin: GeminiHelperPlugin;
  private opts: TimelineAiRewriteModalOptions;
  private instructionEl: HTMLTextAreaElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private generateBtn: HTMLButtonElement | null = null;
  private applyBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private diffLabelEl: HTMLElement | null = null;
  private diffContainerEl: HTMLElement | null = null;
  private diffState: DiffRendererState | null = null;
  private original: string;
  private latest: string | null = null;
  private busy = false;
  private generatedOnce = false;

  constructor(app: App, plugin: GeminiHelperPlugin, opts: TimelineAiRewriteModalOptions) {
    super(app);
    this.plugin = plugin;
    this.opts = opts;
    this.original = opts.content;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("llm-hub-db-ai-modal");
    contentEl.addClass("llm-hub-db-timeline-ai-modal");

    contentEl.createEl("h3", { text: t("dashboard.timelineAiEdit") });

    const row = contentEl.createDiv({ cls: "llm-hub-db-ai-row" });
    row.createEl("label", { text: t("dashboard.timelineAiInstruction") });
    this.instructionEl = row.createEl("textarea", {
      attr: {
        rows: "4",
        placeholder: t("dashboard.timelineAiInstructionPlaceholder"),
      },
    });

    const modelRow = contentEl.createDiv({ cls: "llm-hub-db-ai-row" });
    modelRow.createEl("label", { text: t("aiWorkflow.model") });
    this.modelSelect = modelRow.createEl("select");
    const models = this.availableTextModels();
    const defaultModel = this.defaultModel(models);
    for (const model of models) {
      const option = this.modelSelect.createEl("option", {
        text: model.displayName,
        value: model.name,
      });
      if (model.name === defaultModel) option.selected = true;
    }

    this.statusEl = contentEl.createDiv({ cls: "llm-hub-db-ai-status" });
    this.diffLabelEl = contentEl.createDiv({ cls: "llm-hub-db-ai-difflabel" });
    this.diffContainerEl = contentEl.createDiv({ cls: "llm-hub-db-ai-diff" });
    this.diffContainerEl.hide();

    const footer = contentEl.createDiv({ cls: "llm-hub-db-ai-footer" });
    const cancelBtn = footer.createEl("button", { text: t("dashboard.cancel") });
    cancelBtn.addEventListener("click", () => this.close());

    this.generateBtn = footer.createEl("button");
    const generateIcon = this.generateBtn.createSpan();
    setIcon(generateIcon, "sparkles");
    this.generateBtn.createSpan({ text: this.generateButtonText() });
    this.generateBtn.addEventListener("click", () => void this.run());

    this.applyBtn = footer.createEl("button", { cls: "mod-cta", text: t("dashboard.aiBaseApply") });
    this.applyBtn.disabled = true;
    this.applyBtn.addEventListener("click", () => {
      if (!this.latest) return;
      this.opts.onApply(this.latest);
      this.close();
      new Notice(t("dashboard.timelineAiApplied"));
    });

    window.setTimeout(() => this.instructionEl?.focus(), 0);
  }

  private availableTextModels(): ReturnType<typeof getAvailableModels> {
    return this.plugin.settings.googleApiKey
      ? getAvailableModels(this.plugin.settings.apiPlan).filter((model) => !model.isImageModel)
      : [];
  }

  private defaultModel(models: ReturnType<typeof getAvailableModels>): ModelType | null {
    const lastTimelineAiModel = this.plugin.settings.lastTimelineAiModel;
    if (lastTimelineAiModel && models.some((model) => model.name === lastTimelineAiModel)) {
      return lastTimelineAiModel as ModelType;
    }
    const selected = this.plugin.getSelectedModel();
    if (models.some((model) => model.name === selected)) return selected;
    return models[0]?.name ?? null;
  }

  private chooseModel(): ModelType | null {
    const selected = this.modelSelect?.value as ModelType | undefined;
    if (!selected) return null;
    return this.availableTextModels().some((model) => model.name === selected) ? selected : null;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    if (this.generateBtn) this.generateBtn.disabled = busy;
    if (this.applyBtn) this.applyBtn.disabled = busy || !this.latest;
    if (this.modelSelect) this.modelSelect.disabled = busy;
  }

  private generateButtonText(): string {
    return this.generatedOnce ? t("dashboard.aiBaseRegenerate") : t("dashboard.aiBaseGenerate");
  }

  private updateGenerateButton(): void {
    if (!this.generateBtn) return;
    const iconName = this.generatedOnce ? "refresh-cw" : "sparkles";
    this.generateBtn.empty();
    const icon = this.generateBtn.createSpan();
    setIcon(icon, iconName);
    this.generateBtn.createSpan({ text: this.generateButtonText() });
  }

  private setStatus(text: string, isError = false): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
    this.statusEl.toggleClass("is-error", isError);
  }

  private renderDiff(next: string): void {
    if (!this.diffContainerEl || !this.diffLabelEl) return;
    this.diffState?.destroy();
    this.diffState = null;
    this.diffContainerEl.empty();
    this.diffLabelEl.empty();
    this.diffLabelEl.createSpan({ text: t("dashboard.aiBaseDiffTitle") });
    this.diffState = renderDiffView(this.diffContainerEl, this.original, next, { viewMode: "split" });
    createDiffViewToggle(this.diffLabelEl, this.diffState);
    this.diffContainerEl.show();
  }

  private async run(): Promise<void> {
    if (this.busy) return;
    const instruction = this.instructionEl?.value.trim() ?? "";
    if (!instruction) {
      this.setStatus(t("dashboard.timelineAiInstructionRequired"), true);
      return;
    }
    const model = this.chooseModel();
    if (!model) {
      this.setStatus(t("dashboard.aiNoModels"), true);
      return;
    }

    this.setBusy(true);
    this.setStatus(t("dashboard.aiBaseGenerating"));
    try {
      const base = this.latest ?? this.original;
      this.latest = await generateRewrite(this.plugin, model, base, instruction);
      this.plugin.settings.lastTimelineAiModel = model;
      await this.plugin.saveSettings();
      this.generatedOnce = true;
      this.renderDiff(this.latest);
      if (this.instructionEl) {
        this.instructionEl.value = "";
        this.instructionEl.placeholder = t("dashboard.timelineAiAdditionalPlaceholder");
      }
      this.updateGenerateButton();
      this.setStatus("");
    } catch (err) {
      this.setStatus(`${t("dashboard.aiBaseFailed")}: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      this.setBusy(false);
    }
  }

  onClose(): void {
    this.diffState?.destroy();
    this.diffState = null;
    this.contentEl.empty();
  }
}
