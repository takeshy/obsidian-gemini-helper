import { Notice, Setting } from "obsidian";
import {
  compareVersions,
  fetchSkillCatalog,
  importExternalSkills,
  listInstalledSkills,
  OFFICIAL_SKILLS_REPO,
  type InstalledSkill,
  type SkillCatalogEntry,
} from "src/core/externalSkills";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import { t } from "src/i18n";
import { formatError } from "src/utils/error";
import type { SettingsContext } from "./settingsContext";

// Fetched once per Obsidian session (on the first settings open after startup)
// and then cached across re-renders. `loadSucceeded` is the source of truth for
// "we already have the data" — once true we never auto-refetch; an install
// forces a reload, and a failed initial load is recovered via the Retry button.
let catalogCache: SkillCatalogEntry[] | null = null;
let installedCache: InstalledSkill[] | null = null;
let loadSucceeded = false;
let loading = false;
let loadError: string | null = null;
let selectedSkillId = "";

async function loadState(ctx: SettingsContext, force: boolean): Promise<void> {
  if (loading) return;
  if (!force && loadSucceeded) return;
  loading = true;
  loadError = null;
  try {
    const [catalog, installed] = await Promise.all([
      fetchSkillCatalog(ctx.plugin.manifest.id, ctx.plugin.manifest.version),
      listInstalledSkills(ctx.plugin.app),
    ]);
    catalogCache = catalog;
    installedCache = installed;
    loadSucceeded = true;
  } catch (e) {
    loadError = formatError(e);
    loadSucceeded = false;
  } finally {
    loading = false;
    ctx.display();
  }
}

function findCatalogEntry(id: string): SkillCatalogEntry | undefined {
  return (catalogCache || []).find(entry => entry.id === id);
}

function updateAvailable(entry: SkillCatalogEntry | undefined, installed: InstalledSkill): boolean {
  if (!entry || !installed.version) return false;
  const cmp = compareVersions(entry.version, installed.version);
  return cmp !== null && cmp > 0;
}

async function installSkill(ctx: SettingsContext, id: string): Promise<void> {
  try {
    const result = await importExternalSkills(
      ctx.plugin.app,
      [id],
      ctx.plugin.manifest.id,
      ctx.plugin.manifest.version,
    );
    if (result.installed.includes(id)) {
      ctx.plugin.settingsEmitter.emit("skills-changed");
      new Notice(t("settings.importSkills.done", { skills: "1", files: String(result.fileCount) }));
    } else {
      const skip = result.skipped.find(item => item.id === id);
      new Notice(t("settings.externalSkills.installSkipped", { id, reason: skip?.reason || "unknown" }));
    }
  } catch (e) {
    new Notice(t("settings.importSkills.failed", { error: formatError(e) }));
  }
  await loadState(ctx, true);
}

async function checkForUpdate(ctx: SettingsContext, installed: InstalledSkill): Promise<void> {
  const entry = findCatalogEntry(installed.id);
  if (!entry) {
    new Notice(t("settings.externalSkills.notInCatalog"));
    return;
  }
  if (!updateAvailable(entry, installed)) {
    new Notice(t("settings.externalSkills.upToDate", { version: installed.version || entry.version }));
    return;
  }
  const confirmed = await new ConfirmModal(
    ctx.plugin.app,
    t("settings.externalSkills.updateConfirm", {
      name: entry.name,
      from: installed.version || "?",
      to: entry.version,
    }),
  ).openAndWait();
  if (!confirmed) return;
  await installSkill(ctx, installed.id);
}

export function displayExternalSkillSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  new Setting(containerEl).setName(t("settings.externalSkills")).setHeading();

  new Setting(containerEl)
    .setName(t("settings.externalSkillsRepository"))
    .setDesc(t("settings.externalSkillsRepository.desc", { repo: OFFICIAL_SKILLS_REPO }));

  // Kick off the initial load once per session. `loadError` gates this so a
  // persistent failure doesn't loop; the Retry button forces a fresh attempt.
  if (!loading && !loadSucceeded && !loadError) {
    void loadState(ctx, false);
  }

  if (loading) {
    new Setting(containerEl).setDesc(t("settings.externalSkills.loading"));
    return;
  }
  if (loadError) {
    // A failed load persists in module state, so offer an explicit retry —
    // reopening the tab won't re-fetch on its own.
    new Setting(containerEl)
      .setDesc(t("settings.externalSkills.loadFailed", { error: loadError }))
      .addButton(button =>
        button
          .setButtonText(t("settings.externalSkills.retry"))
          .onClick(() => { void loadState(ctx, true); })
      );
    return;
  }

  const catalog = catalogCache || [];
  const installed = installedCache || [];
  const installedIds = new Set(installed.map(skill => skill.id));

  // Install a skill: dropdown of not-yet-installed skills + install button.
  // Already-installed skills are managed in the "Installed skills" section below.
  const installable = catalog.filter(entry => !installedIds.has(entry.id));
  if (catalog.length === 0) {
    new Setting(containerEl).setDesc(t("settings.externalSkills.noSkills"));
  } else if (installable.length === 0) {
    new Setting(containerEl).setDesc(t("settings.externalSkills.allInstalled"));
  } else {
    if (!selectedSkillId || !installable.some(entry => entry.id === selectedSkillId)) {
      selectedSkillId = installable[0].id;
    }
    new Setting(containerEl)
      .setName(t("settings.externalSkills.install"))
      .setDesc(t("settings.externalSkills.install.desc"))
      .addDropdown(dropdown => {
        for (const entry of installable) {
          dropdown.addOption(entry.id, `${entry.name} (v${entry.version})`);
        }
        dropdown.setValue(selectedSkillId);
        dropdown.onChange(value => { selectedSkillId = value; });
      })
      .addButton(button =>
        button
          .setButtonText(t("settings.externalSkills.installButton"))
          .setCta()
          .onClick(() => { void installSkill(ctx, selectedSkillId); })
      );
  }

  // Installed skills with per-skill update check.
  if (installed.length > 0) {
    new Setting(containerEl).setName(t("settings.externalSkills.installed")).setHeading();
    for (const skill of installed) {
      const entry = findCatalogEntry(skill.id);
      const hasUpdate = updateAvailable(entry, skill);
      const versionLabel = skill.version ? `v${skill.version}` : t("settings.externalSkills.noVersion");
      const desc = hasUpdate && entry
        ? `${versionLabel} → v${entry.version} (${t("settings.externalSkills.updateAvailable")})`
        : versionLabel;

      const setting = new Setting(containerEl)
        .setName(skill.name)
        .setDesc(desc);

      // Only versioned skills can be checked for updates against the repository.
      if (skill.version) {
        setting.addButton(button => {
          button
            .setButtonText(t("settings.externalSkills.check"))
            .onClick(() => { void checkForUpdate(ctx, skill); });
          if (hasUpdate) button.setCta();
        });
      }
    }
  }
}
