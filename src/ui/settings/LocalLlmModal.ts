import { Modal, App, Setting, Notice } from "obsidian";
import { verifyLocalLlm, fetchLocalLlmModels } from "src/core/localLlmProvider";
import { t } from "src/i18n";
import type { LocalLlmConfig } from "src/types";

export class LocalLlmModal extends Modal {
  private config: LocalLlmConfig;
  private onSave: (config: LocalLlmConfig) => void | Promise<void>;
  private modelDropdown: HTMLSelectElement | null = null;

  constructor(
    app: App,
    currentConfig: LocalLlmConfig,
    onSave: (config: LocalLlmConfig) => void | Promise<void>,
  ) {
    super(app);
    this.config = { ...currentConfig };
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gemini-helper-local-llm-modal");
    contentEl.createEl("h2", { text: t("settings.localLlmModal.title") });

    // Description
    const descEl = contentEl.createDiv({ cls: "gemini-helper-cli-path-desc" });
    descEl.textContent = t("settings.localLlmModal.desc");

    // Base URL
    new Setting(contentEl)
      .setName(t("settings.localLlmModal.baseUrl"))
      .setDesc(t("settings.localLlmModal.baseUrlDesc"))
      .addText((text) => {
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case -- URL placeholder
          .setPlaceholder("http://localhost:11434")
          .setValue(this.config.baseUrl)
          .onChange((value) => {
            this.config.baseUrl = value;
          });
        text.inputEl.addClass("gemini-helper-cli-path-input");
      });

    // API Key (optional)
    new Setting(contentEl)
      .setName(t("settings.localLlmModal.apiKey"))
      .setDesc(t("settings.localLlmModal.apiKeyDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.localLlmModal.apiKeyPlaceholder"))
          .setValue(this.config.apiKey || "")
          .onChange((value) => {
            this.config.apiKey = value || undefined;
          });
        text.inputEl.type = "password";
      });

    // Model name with fetch button
    const modelSetting = new Setting(contentEl)
      .setName(t("settings.localLlmModal.model"))
      .setDesc(t("settings.localLlmModal.modelDesc"));

    // Model dropdown (initially populated with current value only)
    modelSetting.controlEl.createEl("select", {}, (select) => {
      this.modelDropdown = select;
      select.addClass("dropdown");
      if (this.config.model) {
        const opt = select.createEl("option", { text: this.config.model, value: this.config.model });
        opt.selected = true;
      }
      select.addEventListener("change", () => {
        this.config.model = select.value;
      });
    });

    // Fetch models button
    modelSetting.addButton((btn) =>
      btn
        .setButtonText(t("settings.localLlmModal.fetchModels"))
        .onClick(async () => {
          btn.setButtonText(t("settings.localLlmModal.fetching"));
          btn.setDisabled(true);
          try {
            const models = await fetchLocalLlmModels(this.config);
            if (models.length === 0) {
              new Notice(t("settings.localLlmModal.noModelsFound"));
              return;
            }
            if (this.modelDropdown) {
              this.modelDropdown.empty();
              for (const model of models) {
                const opt = this.modelDropdown.createEl("option", { text: model, value: model });
                if (model === this.config.model) {
                  opt.selected = true;
                }
              }
              // Auto-select first if none selected
              if (!this.config.model || !models.includes(this.config.model)) {
                this.config.model = models[0];
                this.modelDropdown.value = models[0];
              }
            }
            new Notice(t("settings.localLlmModal.modelsLoaded").replace("{{count}}", String(models.length)));
          } catch (err) {
            new Notice(`Error: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            btn.setButtonText(t("settings.localLlmModal.fetchModels"));
            btn.setDisabled(false);
          }
        })
    );

    // Model name text input (manual entry)
    modelSetting.addText((text) => {
      text
        .setPlaceholder(t("settings.localLlmModal.modelPlaceholder"))
        .setValue(this.config.model)
        .onChange((value) => {
          this.config.model = value;
        });
    });

    // Enable thinking
    new Setting(contentEl)
      .setName(t("settings.localLlmModal.enableThinking"))
      .setDesc(t("settings.localLlmModal.enableThinkingDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.config.enableThinking ?? false)
          .onChange((value) => {
            this.config.enableThinking = value || undefined;
          });
      });

    // Temperature
    new Setting(contentEl)
      .setName(t("settings.localLlmModal.temperature"))
      .setDesc(t("settings.localLlmModal.temperatureDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.localLlmModal.serverDefault"))
          .setValue(this.config.temperature != null ? String(this.config.temperature) : "")
          .onChange((value) => {
            const trimmed = value.trim();
            this.config.temperature = trimmed ? parseFloat(trimmed) : undefined;
          });
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "2";
        text.inputEl.step = "0.1";
      });

    // Max tokens
    new Setting(contentEl)
      .setName(t("settings.localLlmModal.maxTokens"))
      .setDesc(t("settings.localLlmModal.maxTokensDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.localLlmModal.serverDefault"))
          .setValue(this.config.maxTokens != null ? String(this.config.maxTokens) : "")
          .onChange((value) => {
            const trimmed = value.trim();
            this.config.maxTokens = trimmed ? parseInt(trimmed, 10) : undefined;
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.step = "1";
      });

    // Test connection button
    const testSetting = new Setting(contentEl);
    const testStatusEl = testSetting.controlEl.createDiv({ cls: "gemini-helper-cli-row-status" });

    testSetting.addButton((btn) =>
      btn
        .setButtonText(t("settings.localLlmModal.testConnection"))
        .onClick(async () => {
          testStatusEl.empty();
          testStatusEl.removeClass("gemini-helper-cli-status--success", "gemini-helper-cli-status--error");
          btn.setButtonText(t("settings.localLlmModal.testing"));
          btn.setDisabled(true);

          try {
            const result = await verifyLocalLlm(this.config);
            if (result.success) {
              testStatusEl.addClass("gemini-helper-cli-status--success");
              testStatusEl.textContent = t("settings.localLlmModal.connectionSuccess");
            } else {
              testStatusEl.addClass("gemini-helper-cli-status--error");
              testStatusEl.textContent = result.error || t("settings.localLlmModal.connectionFailed");
            }
          } catch (err) {
            testStatusEl.addClass("gemini-helper-cli-status--error");
            testStatusEl.textContent = err instanceof Error ? err.message : String(err);
          } finally {
            btn.setButtonText(t("settings.localLlmModal.testConnection"));
            btn.setDisabled(false);
          }
        })
    );

    // Save / Cancel
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText(t("common.cancel")).onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("common.save"))
          .setCta()
          .onClick(() => {
            if (!this.config.baseUrl.trim()) {
              new Notice(t("settings.localLlmModal.baseUrlRequired"));
              return;
            }
            void this.onSave(this.config);
            this.close();
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
