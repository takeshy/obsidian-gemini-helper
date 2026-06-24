// AI dialog for creating or editing a `.base` file (gemihub's ✨ AI config-editor
// pattern). Collects a description + target model, generates the YAML headlessly
// via generateBaseYaml, writes it straight to the vault, and reports the path.

import { App, Modal, Notice, TFile, setIcon } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import {
  getAvailableModels,
  type ModelType,
} from "src/types";
import { t } from "src/i18n";
import { generateBaseYaml } from "./aiBaseGenerate";
import { BASES_FOLDER } from "./types";

export type AIBaseMode = "create" | "modify";

interface AIBaseModalOptions {
  mode: AIBaseMode;
  /** For modify: existing `.base` vault path. */
  basePath?: string;
  /** Called with the written `.base` path on success. */
  onComplete: (path: string) => void;
}

export class AIBaseModal extends Modal {
  private plugin: GeminiHelperPlugin;
  private opts: AIBaseModalOptions;
  private nameInput: HTMLInputElement | null = null;
  private descInput: HTMLTextAreaElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private generateBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private busy = false;

  constructor(app: App, plugin: GeminiHelperPlugin, opts: AIBaseModalOptions) {
    super(app);
    this.plugin = plugin;
    this.opts = opts;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("llm-hub-db-ai-modal");

    contentEl.createEl("h3", {
      text: this.opts.mode === "create" ? t("dashboard.aiBaseCreate") : t("dashboard.aiBaseEdit"),
    });

    if (this.opts.mode === "create") {
      const nameRow = contentEl.createDiv({ cls: "llm-hub-db-ai-row" });
      nameRow.createEl("label", { text: t("dashboard.aiBaseName") });
      this.nameInput = nameRow.createEl("input", {
        type: "text",
        attr: { placeholder: "Tasks" },
      });
    } else {
      contentEl.createEl("p", {
        cls: "llm-hub-db-ai-target",
        text: this.opts.basePath ?? "",
      });
    }

    const descRow = contentEl.createDiv({ cls: "llm-hub-db-ai-row" });
    descRow.createEl("label", { text: t("dashboard.aiBaseDescribe") });
    this.descInput = descRow.createEl("textarea", {
      attr: {
        rows: "5",
        placeholder: t("dashboard.aiBaseDescribePlaceholder"),
      },
    });

    const modelRow = contentEl.createDiv({ cls: "llm-hub-db-ai-row" });
    modelRow.createEl("label", { text: t("aiWorkflow.model") });
    this.modelSelect = modelRow.createEl("select");
    this.populateModels(this.modelSelect);

    this.statusEl = contentEl.createDiv({ cls: "llm-hub-db-ai-status" });

    const footer = contentEl.createDiv({ cls: "llm-hub-db-ai-footer" });
    const cancelBtn = footer.createEl("button", { text: t("dashboard.cancel") });
    cancelBtn.addEventListener("click", () => this.close());

    this.generateBtn = footer.createEl("button", { cls: "mod-cta" });
    const icon = this.generateBtn.createSpan();
    setIcon(icon, "sparkles");
    this.generateBtn.createSpan({ text: t("dashboard.aiBaseGenerate") });
    this.generateBtn.addEventListener("click", () => void this.run());
  }

  private populateModels(select: HTMLSelectElement): void {
    const all = this.plugin.settings.googleApiKey
      ? getAvailableModels(this.plugin.settings.apiPlan).filter((m) => !m.isImageModel)
      : [];

    const last = this.plugin.settings.lastAIWorkflowModel;
    const def = last && all.some((m) => m.name === last) ? last : this.plugin.getSelectedModel();

    if (all.length === 0) {
      select.createEl("option", { text: t("dashboard.aiNoModels"), value: "" });
      select.disabled = true;
      return;
    }
    for (const m of all) {
      const opt = select.createEl("option", { text: m.displayName, value: m.name });
      if (m.name === def) opt.selected = true;
    }
  }

  private setStatus(text: string, isError = false): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
    this.statusEl.toggleClass("is-error", isError);
  }

  private async run(): Promise<void> {
    if (this.busy) return;
    const desc = this.descInput?.value.trim() ?? "";
    const model = (this.modelSelect?.value ?? "") as ModelType;

    if (!model) {
      this.setStatus(t("dashboard.aiNoModels"), true);
      return;
    }
    if (!desc) {
      this.setStatus(t("dashboard.aiBaseDescribeRequired"), true);
      return;
    }

    let targetPath: string;
    let currentYaml: string | undefined;
    if (this.opts.mode === "create") {
      const name = (this.nameInput?.value.trim() ?? "").replace(/\.base$/i, "");
      if (!name) {
        this.setStatus(t("dashboard.aiBaseNameRequired"), true);
        return;
      }
      targetPath = `${BASES_FOLDER}/${name}.base`;
      if (this.app.vault.getAbstractFileByPath(targetPath)) {
        this.setStatus(t("dashboard.aiBaseExists"), true);
        return;
      }
    } else {
      targetPath = this.opts.basePath ?? "";
      const existing = this.app.vault.getAbstractFileByPath(targetPath);
      if (existing instanceof TFile) currentYaml = await this.app.vault.read(existing);
    }

    this.busy = true;
    if (this.generateBtn) this.generateBtn.disabled = true;
    this.setStatus(t("dashboard.aiBaseGenerating"));
    this.plugin.settings.lastAIWorkflowModel = model;
    void this.plugin.saveSettings();

    try {
      const yaml = await generateBaseYaml(this.plugin, model, desc, currentYaml);
      await this.writeBase(targetPath, yaml);
      new Notice(t("dashboard.aiBaseDone"));
      this.opts.onComplete(targetPath);
      this.close();
    } catch (err) {
      this.setStatus(`${t("dashboard.aiBaseFailed")}: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      this.busy = false;
      if (this.generateBtn) this.generateBtn.disabled = false;
    }
  }

  private async writeBase(path: string, yaml: string): Promise<void> {
    const { vault } = this.app;
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (folder && !vault.getAbstractFileByPath(folder)) {
      try {
        await vault.createFolder(folder);
      } catch {
        // race — folder may have just been created
      }
    }
    const existing = vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await vault.modify(existing, yaml);
    } else {
      await vault.create(path, yaml);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
