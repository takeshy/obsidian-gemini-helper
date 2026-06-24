// Modal that previews a kanban card's note. The header shows the card title and
// an "open" icon that navigates to the actual note; the body renders the note's
// markdown read-only.

import { App, Component, MarkdownRenderer, Modal, TFile, setIcon } from "obsidian";
import { t } from "src/i18n";

export class KanbanCardModal extends Modal {
  private component: Component;

  constructor(
    app: App,
    private file: TFile,
    private title: string,
    private sourcePath: string,
    private onOpenNote: () => void,
  ) {
    super(app);
    this.component = new Component();
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("llm-hub-db-kanban-card-modal");

    const header = contentEl.createDiv({ cls: "llm-hub-db-kanban-card-modal-header" });
    header.createEl("h3", {
      text: this.title,
      cls: "llm-hub-db-kanban-card-modal-title",
    });
    const openBtn = header.createEl("button", { cls: "llm-hub-db-kanban-card-modal-open" });
    setIcon(openBtn, "lucide-external-link");
    openBtn.setAttribute("aria-label", t("dashboard.kanbanOpenNote"));
    openBtn.addEventListener("click", () => {
      this.close();
      this.onOpenNote();
    });

    const body = contentEl.createDiv({
      cls: "llm-hub-db-kanban-card-modal-body markdown-rendered",
    });
    this.component.load();
    void this.app.vault.cachedRead(this.file).then((content) => {
      void MarkdownRenderer.render(this.app, content, body, this.sourcePath, this.component);
    });
  }

  onClose(): void {
    this.component.unload();
    this.contentEl.empty();
  }
}
