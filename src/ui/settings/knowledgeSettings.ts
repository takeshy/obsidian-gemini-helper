import { Setting } from "obsidian";
import { t } from "src/i18n";
import type { KnowledgeSource } from "src/types";
import type { SettingsContext } from "./settingsContext";

const DEFAULT_OKF_SOURCE_ID = "okf";
const DEFAULT_OKF_PATH = "Knowledge";

function getOkfSource(ctx: SettingsContext): KnowledgeSource {
  const existing = (ctx.plugin.settings.knowledgeSources || [])[0];
  return {
    id: existing?.id || DEFAULT_OKF_SOURCE_ID,
    name: "OKF",
    path: existing?.path || DEFAULT_OKF_PATH,
    type: "okf",
    enabled: existing?.enabled ?? false,
  };
}

export function displayKnowledgeSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin } = ctx;
  const okfSource = getOkfSource(ctx);

  // Re-read the current source on each save so the toggle and path field do not
  // clobber each other by merging into a snapshot captured at render time.
  const saveOkfSource = async (patch: Partial<KnowledgeSource>): Promise<void> => {
    plugin.settings.knowledgeSources = [{ ...getOkfSource(ctx), ...patch }];
    await plugin.saveSettings();
  };

  new Setting(containerEl).setName(t("settings.knowledge")).setHeading();

  new Setting(containerEl)
    .setName(t("settings.okfSource"))
    .setDesc(t("settings.okfSources.desc"))
    .addToggle((toggle) =>
      toggle.setValue(okfSource.enabled).onChange((value) => {
        void saveOkfSource({ enabled: value });
      })
    );

  new Setting(containerEl)
    .setName(t("settings.okfSourcePath"))
    .setDesc(t("settings.okfSourcePath.desc"))
    .addText((text) =>
      text
        .setValue(okfSource.path)
        .setPlaceholder(DEFAULT_OKF_PATH)
        .onChange((value) => {
          void saveOkfSource({ path: value.trim() || DEFAULT_OKF_PATH });
        })
    );

}
