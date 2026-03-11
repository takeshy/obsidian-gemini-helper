import { Setting } from "obsidian";
import { t } from "src/i18n";
import type { SettingsContext } from "./settingsContext";

export function displaySkillsSettings(containerEl: HTMLElement, _ctx: SettingsContext): void {
  new Setting(containerEl).setName(t("settings.skills")).setHeading();
}
