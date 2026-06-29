import { Notice, Setting } from "obsidian";
import { importExternalSkills } from "src/core/externalSkills";
import { t } from "src/i18n";
import type { KnowledgeSource } from "src/types";
import { formatError } from "src/utils/error";
import type { SettingsContext } from "./settingsContext";

function createKnowledgeSource(): KnowledgeSource {
  return {
    id: `okf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "OKF",
    path: "",
    type: "okf",
    enabled: true,
  };
}

export function displayKnowledgeSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;

  new Setting(containerEl).setName(t("settings.knowledge")).setHeading();

  new Setting(containerEl)
    .setName(t("settings.okfSources"))
    .setDesc(t("settings.okfSources.desc"))
    .addButton((button) =>
      button
        .setButtonText(t("settings.addOkfSource"))
        .onClick(() => {
          void (async () => {
            plugin.settings.knowledgeSources = [
              ...(plugin.settings.knowledgeSources || []),
              createKnowledgeSource(),
            ];
            await plugin.saveSettings();
            display();
          })();
        })
    );

  for (const source of plugin.settings.knowledgeSources || []) {
    const sourceEl = containerEl.createDiv({ cls: "gemini-helper-settings-nested" });

    new Setting(sourceEl)
      .setName(source.name || t("settings.okfSource"))
      .setDesc(source.path || t("settings.okfSource.noPath"))
      .addToggle((toggle) =>
        toggle.setValue(source.enabled).onChange((value) => {
          void (async () => {
            source.enabled = value;
            await plugin.saveSettings();
            plugin.settingsEmitter.emit("knowledge-sources-changed");
          })();
        })
      )
      .addExtraButton((button) =>
        button
          .setIcon("trash")
          .setTooltip(t("settings.deleteSetting"))
          .onClick(() => {
            void (async () => {
              plugin.settings.knowledgeSources = (plugin.settings.knowledgeSources || []).filter(s => s.id !== source.id);
              await plugin.saveSettings();
              plugin.settingsEmitter.emit("knowledge-sources-changed");
              display();
            })();
          })
      );

    new Setting(sourceEl)
      .setName(t("settings.okfSourceName"))
      .addText((text) =>
        text
          .setValue(source.name)
          .setPlaceholder("OKF")
          .onChange((value) => {
            void (async () => {
              source.name = value.trim() || "OKF";
              await plugin.saveSettings();
              plugin.settingsEmitter.emit("knowledge-sources-changed");
            })();
          })
      );

    new Setting(sourceEl)
      .setName(t("settings.okfSourcePath"))
      .setDesc(t("settings.okfSourcePath.desc"))
      .addText((text) =>
        text
          .setValue(source.path)
          .setPlaceholder("Knowledge/okf or C:\\path\\to\\repo\\okf")
          .onChange((value) => {
            void (async () => {
              source.path = value.trim();
              await plugin.saveSettings();
              plugin.settingsEmitter.emit("knowledge-sources-changed");
            })();
          })
      );
  }

  new Setting(containerEl)
    .setName(t("settings.externalSkillsRepository"))
    .setDesc(t("settings.externalSkillsRepository.desc"))
    .addText((text) =>
      text
        .setValue(plugin.settings.externalSkillsSource?.repositoryUrl || "")
        .setPlaceholder("takeshy/llm-hub-skills or https://github.com/takeshy/llm-hub-skills")
        .onChange((value) => {
          void (async () => {
            plugin.settings.externalSkillsSource = {
              ...(plugin.settings.externalSkillsSource || { path: "", enabled: false, skillIds: [] }),
              repositoryUrl: value.trim(),
            };
            await plugin.saveSettings();
          })();
        })
    )
    .addButton((button) =>
      button
        .setButtonText(t("settings.importSkills"))
        .onClick(() => {
          void (async () => {
            try {
              const result = await importExternalSkills(
                plugin.app,
                plugin.settings.externalSkillsSource?.path || "",
                plugin.settings.externalSkillsSource?.skillIds || [],
                plugin.manifest.id,
                plugin.manifest.version,
                plugin.settings.externalSkillsSource?.repositoryUrl || "",
              );
              plugin.settingsEmitter.emit("skills-changed");
              const skipped = result.skipped.length > 0
                ? ` (${result.skipped.map(item => `${item.id}: ${item.reason}`).join(", ")})`
                : "";
              new Notice(t("settings.importSkills.done", {
                skills: String(result.skillCount),
                files: String(result.fileCount),
              }) + skipped);
            } catch (e) {
              new Notice(t("settings.importSkills.failed", { error: formatError(e) }));
            }
          })();
        })
    );

  const skillIdsSetting = new Setting(containerEl)
    .setName(t("settings.externalSkillIds"))
    .setDesc(t("settings.externalSkillIds.desc"));

  skillIdsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

  skillIdsSetting.addTextArea((text) => {
    text
      .setValue((plugin.settings.externalSkillsSource?.skillIds || []).join("\n"))
      .setPlaceholder("code-review\nokf-author")
      .onChange((value) => {
        void (async () => {
          plugin.settings.externalSkillsSource = {
            ...(plugin.settings.externalSkillsSource || { path: "", repositoryUrl: "", enabled: false }),
            skillIds: value
              .split(/[\n,]/)
              .map(id => id.trim())
              .filter(Boolean),
          };
          await plugin.saveSettings();
        })();
      });
    text.inputEl.rows = 3;
    text.inputEl.addClass("gemini-helper-settings-textarea");
  });
}
