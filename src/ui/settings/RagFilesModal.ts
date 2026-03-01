import { Modal, App } from "obsidian";
import type { RagFileInfo } from "src/types";
import { t } from "src/i18n";

export type RagFilesFilter = "all" | "registered" | "pending";

export class RagFilesModal extends Modal {
  private settingName: string;
  private files: Record<string, RagFileInfo>;
  private searchQuery = "";
  private filter: RagFilesFilter = "all";
  private listEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;

  constructor(
    app: App,
    settingName: string,
    files: Record<string, RagFileInfo>
  ) {
    super(app);
    this.settingName = settingName;
    this.files = files;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gemini-helper-rag-files-modal");
    contentEl.createEl("h2", { text: t("settings.ragFiles.title", { name: this.settingName }) });

    // Search and filter row
    const filterRow = contentEl.createDiv({ cls: "gemini-helper-rag-files-filter" });

    const searchInput = filterRow.createEl("input", {
      type: "text",
      placeholder: t("settings.ragFiles.searchPlaceholder"),
      cls: "gemini-helper-rag-files-search",
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderList();
    });

    const filterBtns = filterRow.createDiv({ cls: "gemini-helper-rag-files-filter-buttons" });

    const filters: { key: RagFilesFilter; label: string }[] = [
      { key: "all", label: t("settings.ragFiles.filterAll") },
      { key: "registered", label: t("settings.ragFiles.filterRegistered") },
      { key: "pending", label: t("settings.ragFiles.filterPending") },
    ];

    for (const f of filters) {
      const btn = filterBtns.createEl("button", {
        text: f.label,
        cls: `gemini-helper-rag-files-filter-btn${f.key === this.filter ? " is-active" : ""}`,
      });
      btn.addEventListener("click", () => {
        this.filter = f.key;
        filterBtns.querySelectorAll<HTMLElement>(".gemini-helper-rag-files-filter-btn").forEach((el) =>
          el.removeClass("is-active")
        );
        btn.addClass("is-active");
        this.renderList();
      });
    }

    // File list container
    this.listEl = contentEl.createDiv({ cls: "gemini-helper-rag-files-list" });

    // File count
    this.countEl = contentEl.createDiv({ cls: "gemini-helper-rag-files-count" });

    this.renderList();

    // Focus search input
    searchInput.focus();
  }

  private renderList() {
    if (!this.listEl || !this.countEl) return;
    this.listEl.empty();

    const entries = Object.entries(this.files)
      .filter(([path, info]) => {
        // Search filter
        if (this.searchQuery && !path.toLowerCase().includes(this.searchQuery.toLowerCase())) {
          return false;
        }
        // Status filter
        if (this.filter === "registered" && !info.fileId) return false;
        if (this.filter === "pending" && info.fileId) return false;
        return true;
      })
      .sort((a, b) => a[0].localeCompare(b[0]));

    this.countEl.textContent = t("settings.ragFiles.fileCount", { count: String(entries.length) });

    if (entries.length === 0) {
      this.listEl.createDiv({
        cls: "gemini-helper-rag-files-empty",
        text: t("settings.ragFiles.noFiles"),
      });
      return;
    }

    for (const [path, info] of entries) {
      const item = this.listEl.createDiv({ cls: "gemini-helper-rag-files-item" });

      const nameEl = item.createDiv({ cls: "gemini-helper-rag-files-item-name" });
      nameEl.textContent = path;

      const metaEl = item.createDiv({ cls: "gemini-helper-rag-files-item-meta" });

      if (info.uploadedAt) {
        const dateEl = metaEl.createSpan({ cls: "gemini-helper-rag-files-item-date" });
        dateEl.textContent = new Date(info.uploadedAt).toLocaleString();
      }

      const isRegistered = !!info.fileId;
      metaEl.createSpan({
        cls: `gemini-helper-rag-files-status ${isRegistered ? "gemini-helper-rag-files-status--registered" : "gemini-helper-rag-files-status--pending"}`,
        text: isRegistered ? t("settings.ragFiles.registered") : t("settings.ragFiles.pending"),
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
