import { Setting, Notice, Platform } from "obsidian";
import { verifyCli, verifyClaudeCli, verifyCodexCli } from "src/core/cliProvider";
import { t } from "src/i18n";
import { DEFAULT_CLI_CONFIG } from "src/types";
import { CliPathModal, type CliType } from "./CliPathModal";
import type { SettingsContext } from "./settingsContext";

export function displayCliSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  if (Platform.isMobile) return;

  const { plugin, display } = ctx;
  const app = plugin.app;
  const cliConfig = plugin.settings.cliConfig || DEFAULT_CLI_CONFIG;

  new Setting(containerEl).setName(t("settings.cliProviders")).setHeading();

  // Introduction
  const introEl = containerEl.createDiv({ cls: "setting-item-description gemini-helper-cli-intro" });
  introEl.textContent = t("settings.cliIntro");

  // Gemini CLI row
  createCliVerifyRow(containerEl, {
    name: "Gemini CLI",
    cliType: "gemini",
    isVerified: !!cliConfig.cliVerified,
    customPath: cliConfig.geminiCliPath,
    installCmd: "npm install -g @google/gemini-cli",
    onVerify: (statusEl) => handleVerifyCli(statusEl, plugin, display, "gemini"),
    onDisable: async () => {
      plugin.settings.cliConfig = { ...cliConfig, cliVerified: false };
      await plugin.saveSettings();
      display();
      new Notice(t("settings.geminiCliDisabled"));
    },
    onSettings: (cliType, customPath) => openCliPathModal(app, cliType, customPath, plugin, display),
  });

  // Claude CLI row
  createCliVerifyRow(containerEl, {
    name: "Claude CLI",
    cliType: "claude",
    isVerified: !!cliConfig.claudeCliVerified,
    customPath: cliConfig.claudeCliPath,
    installCmd: "npm install -g @anthropic-ai/claude-code",
    onVerify: (statusEl) => handleVerifyCli(statusEl, plugin, display, "claude"),
    onDisable: async () => {
      plugin.settings.cliConfig = { ...cliConfig, claudeCliVerified: false };
      await plugin.saveSettings();
      display();
      new Notice(t("settings.claudeCliDisabled"));
    },
    onSettings: (cliType, customPath) => openCliPathModal(app, cliType, customPath, plugin, display),
  });

  // Codex CLI row
  createCliVerifyRow(containerEl, {
    name: "Codex CLI",
    cliType: "codex",
    isVerified: !!cliConfig.codexCliVerified,
    customPath: cliConfig.codexCliPath,
    installCmd: "npm install -g @openai/codex",
    onVerify: (statusEl) => handleVerifyCli(statusEl, plugin, display, "codex"),
    onDisable: async () => {
      plugin.settings.cliConfig = { ...cliConfig, codexCliVerified: false };
      await plugin.saveSettings();
      display();
      new Notice(t("settings.codexCliDisabled"));
    },
    onSettings: (cliType, customPath) => openCliPathModal(app, cliType, customPath, plugin, display),
  });

  // CLI limitations notice
  const noticeEl = containerEl.createDiv({ cls: "gemini-helper-cli-notice gemini-helper-cli-notice--spaced" });
  const noteTitle = noticeEl.createEl("strong");
  noteTitle.textContent = t("settings.cliLimitations");
  const noteList = noticeEl.createEl("ul");
  noteList.createEl("li").textContent = t("settings.cliLimitation1");
  noteList.createEl("li").textContent = t("settings.cliLimitation2");
  noteList.createEl("li").textContent = t("settings.cliLimitation3");
}

function createCliVerifyRow(
  containerEl: HTMLElement,
  options: {
    name: string;
    cliType: CliType;
    isVerified: boolean;
    customPath?: string;
    installCmd: string;
    onVerify: (statusEl: HTMLElement) => Promise<void>;
    onDisable: () => Promise<void>;
    onSettings: (cliType: CliType, customPath?: string) => void;
  }
): void {
  const setting = new Setting(containerEl)
    .setName(options.name)
    .setDesc(`Install: ${options.installCmd}`);

  const statusEl = setting.controlEl.createDiv({ cls: "gemini-helper-cli-row-status" });

  if (options.isVerified) {
    statusEl.addClass("gemini-helper-cli-status--success");
    statusEl.textContent = t("settings.cliVerified");
    setting.addButton((button) =>
      button
        .setButtonText(t("settings.cliDisable"))
        .onClick(() => void options.onDisable())
    );
  } else {
    setting.addButton((button) =>
      button
        .setButtonText(t("settings.cliVerify"))
        .setCta()
        .onClick(() => void options.onVerify(statusEl))
    );
  }

  setting.addExtraButton((button) =>
    button
      .setIcon("settings")
      .setTooltip(t("settings.cliPathSettings"))
      .onClick(() => {
        options.onSettings(options.cliType, options.customPath);
      })
  );
}

function openCliPathModal(
  app: import("obsidian").App,
  cliType: CliType,
  currentPath: string | undefined,
  plugin: import("src/plugin").GeminiHelperPlugin,
  display: () => void
): void {
  new CliPathModal(
    app,
    cliType,
    currentPath,
    async (path: string | undefined) => {
      const cliConfig = plugin.settings.cliConfig;
      const pathKey = cliType === "gemini" ? "geminiCliPath" :
                      cliType === "claude" ? "claudeCliPath" : "codexCliPath";
      if (path) {
        plugin.settings.cliConfig = { ...cliConfig, [pathKey]: path };
        await plugin.saveSettings();
        new Notice(t("settings.cliPathSaved"));
      } else {
        const newConfig = { ...cliConfig };
        delete newConfig[pathKey];
        plugin.settings.cliConfig = newConfig;
        await plugin.saveSettings();
        new Notice(t("settings.cliPathCleared"));
      }
      display();
    }
  ).open();
}

async function handleVerifyCli(
  statusEl: HTMLElement,
  plugin: import("src/plugin").GeminiHelperPlugin,
  display: () => void,
  cliType: "gemini" | "claude" | "codex"
): Promise<void> {
  statusEl.empty();
  statusEl.removeClass("gemini-helper-cli-status--success", "gemini-helper-cli-status--error");

  const verifyFn = cliType === "gemini" ? verifyCli :
                   cliType === "claude" ? verifyClaudeCli : verifyCodexCli;
  const customPathKey = cliType === "gemini" ? "geminiCliPath" :
                        cliType === "claude" ? "claudeCliPath" : "codexCliPath";
  const verifiedKey = cliType === "gemini" ? "cliVerified" :
                      cliType === "claude" ? "claudeCliVerified" : "codexCliVerified";

  const verifyingText = cliType === "gemini" ? t("settings.cliVerifyingCli") : t("settings.cliVerifying");
  statusEl.setText(verifyingText);

  const notFoundFallback = cliType === "gemini" ? "Gemini CLI not found" :
                           cliType === "claude" ? "Claude CLI not found" : "Codex CLI not found";
  const loginText = cliType === "gemini" ? t("settings.cliRunGeminiLogin") :
                    cliType === "claude" ? t("settings.cliRunClaudeLogin") : t("settings.cliRunCodexLogin");
  const successNotice = cliType === "gemini" ? t("settings.geminiCliVerified") :
                        cliType === "claude" ? t("settings.claudeCliVerified") : t("settings.codexCliVerified");

  try {
    const customPath = plugin.settings.cliConfig[customPathKey];
    const result = await verifyFn(customPath);

    if (!result.success) {
      statusEl.addClass("gemini-helper-cli-status--error");
      plugin.settings.cliConfig = { ...plugin.settings.cliConfig, [verifiedKey]: false };
      await plugin.saveSettings();

      statusEl.empty();
      if (result.stage === "version") {
        statusEl.createEl("strong", { text: t("settings.cliNotFound") });
        statusEl.createSpan({ text: result.error || notFoundFallback });
      } else {
        statusEl.createEl("strong", { text: t("settings.cliLoginRequired") });
        statusEl.createSpan({ text: result.error || loginText });
      }
      return;
    }

    plugin.settings.cliConfig = { ...plugin.settings.cliConfig, [verifiedKey]: true };
    await plugin.saveSettings();
    display();
    new Notice(successNotice);
  } catch (err) {
    plugin.settings.cliConfig = { ...plugin.settings.cliConfig, [verifiedKey]: false };
    await plugin.saveSettings();
    statusEl.addClass("gemini-helper-cli-status--error");
    statusEl.empty();
    statusEl.createEl("strong", { text: t("common.error") });
    statusEl.createSpan({ text: String(err) });
  }
}
