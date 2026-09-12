import { Setting, Notice } from "obsidian";
import { t } from "src/i18n";
import { getAvailableModels, type SlashCommand } from "src/types";
import { SlashCommandModal, type SlashCommandModalOptions } from "obsidian-llm-hub-common/modals";
import type { SettingsContext } from "./settingsContext";
import { discoverSkills } from "src/core/skillsLoader";

export function displaySlashCommandSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  const app = plugin.app;
  const modalOptions: SlashCommandModalOptions = {
    models: getAvailableModels(plugin.settings.apiPlan),
    // This host's composer still clears one source when the other is picked,
    // so a command cannot pin Web search and a RAG index together.
    search: { webSearch: true, ragSettings: plugin.settings.ragEnabled ? plugin.getRagSettingNames() : [], combinable: false },
    mcpServers: plugin.settings.mcpServers,
    editConfirmation: true,
  };
  const openCommandModal = async (
    command: SlashCommand | null,
    onSubmit: (command: SlashCommand) => void | Promise<void>,
  ): Promise<void> => {
    const skills = await discoverSkills(app, plugin.settings.skillsFolder);
    new SlashCommandModal(app, command, { ...modalOptions, skills }, onSubmit).open();
  };

  new Setting(containerEl).setName(t("settings.slashCommands")).setHeading();

  new Setting(containerEl)
    .setName(t("settings.manageCommands"))
    .setDesc(t("settings.manageCommands.desc"))
    .addButton((btn) =>
      btn
        .setButtonText(t("settings.addCommand"))
        .setCta()
        .onClick(() => {
          void openCommandModal(
            null,
            async (command: SlashCommand) => {
              plugin.settings.slashCommands.push(command);
              await plugin.saveSettings();
              display();
              new Notice(t("settings.commandCreated", { name: command.name }));
            }
          );
        })
    );

  // List existing commands
  if (plugin.settings.slashCommands.length > 0) {
    for (const command of plugin.settings.slashCommands) {
      const commandSetting = new Setting(containerEl)
        .setName(`/${command.name}`)
        .setDesc(
          command.description ||
            command.promptTemplate.slice(0, 50) +
              (command.promptTemplate.length > 50 ? "..." : "")
        );

      // Edit button
      commandSetting.addExtraButton((btn) => {
        btn
          .setIcon("pencil")
          .setTooltip(t("settings.editCommand"))
          .onClick(() => {
            void openCommandModal(
              command,
              async (updated: SlashCommand) => {
                const index = plugin.settings.slashCommands.findIndex(
                  (c) => c.id === command.id
                );
                if (index >= 0) {
                  plugin.settings.slashCommands[index] = updated;
                  await plugin.saveSettings();
                  display();
                  new Notice(t("settings.commandUpdated", { name: updated.name }));
                }
              }
            );
          });
      });

      // Delete button
      commandSetting.addExtraButton((btn) => {
        btn
          .setIcon("trash")
          .setTooltip(t("settings.deleteCommand"))
          .onClick(() => {
            void (async () => {
              plugin.settings.slashCommands =
                plugin.settings.slashCommands.filter(
                  (c) => c.id !== command.id
                );
              await plugin.saveSettings();
              display();
              new Notice(t("settings.commandDeleted", { name: command.name }));
            })();
          });
      });
    }
  }
}
