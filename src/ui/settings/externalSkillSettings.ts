import { Notice, Setting } from "obsidian";
import { importExternalSkills } from "src/core/externalSkills";
import { t } from "src/i18n";
import { formatError } from "src/utils/error";
import type { SettingsContext } from "./settingsContext";

export function displayExternalSkillSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin } = ctx;

  new Setting(containerEl).setName(t("settings.externalSkills")).setHeading();

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
