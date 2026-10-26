import { App, Modal, Setting } from "obsidian";
import { t } from "src/i18n";

export class GoogleSearchConsentModal extends Modal {
  private resolver: ((approved: boolean) => void) | null = null;
  constructor(app: App) { super(app); }
  private resolve(approved: boolean): void { const resolver = this.resolver; this.resolver = null; resolver?.(approved); }
  onOpen(): void {
    this.setTitle(t("grounding.confirmTitle"));
    for (const paragraph of t("grounding.confirmMessage").split("\n\n")) this.contentEl.createEl("p", { text: paragraph });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t("common.cancel")).onClick(() => { this.resolve(false); this.close(); }))
      .addButton(button => button.setButtonText(t("grounding.enable")).setCta().onClick(() => { this.resolve(true); this.close(); }));
  }
  onClose(): void { this.contentEl.empty(); this.resolve(false); }
  openAndWait(): Promise<boolean> { return new Promise(resolve => { this.resolver = resolve; this.open(); }); }
}
