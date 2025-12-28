import { Modal, App, Notice, Platform } from "obsidian";

// Sanitize filename to remove characters not allowed in file systems
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "") // Remove Windows-forbidden chars
    .replace(/[\x00-\x1f]/g, "")  // Remove control characters
    .trim()
    .slice(0, 50) || "output";    // Limit length and provide fallback
}

export class HTMLPreviewModal extends Modal {
  private htmlContent: string;
  private baseName: string;

  constructor(app: App, htmlContent: string, baseName: string) {
    super(app);
    this.htmlContent = htmlContent;
    this.baseName = sanitizeFileName(baseName);
  }

  onOpen() {
    const { contentEl, modalEl } = this;

    // Make modal larger
    modalEl.addClass("gemini-helper-html-preview-modal");

    // Header with actions
    const header = contentEl.createDiv({ cls: "gemini-helper-html-preview-header" });

    const title = header.createEl("h3", { text: "HTML Preview" });
    title.style.margin = "0";

    const actions = header.createDiv({ cls: "gemini-helper-html-preview-actions" });

    // Copy HTML button
    const copyBtn = actions.createEl("button", { text: "Copy HTML", cls: "mod-cta" });
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(this.htmlContent);
        new Notice("HTML copied to clipboard");
      } catch {
        new Notice("Failed to copy HTML");
      }
    });

    // Save button
    const saveBtn = actions.createEl("button", { text: "Save" });
    saveBtn.addEventListener("click", () => {
      void this.saveHtml();
    });

    // Close button
    const closeBtn = actions.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());

    // iframe container
    const iframeContainer = contentEl.createDiv({ cls: "gemini-helper-html-preview-container" });

    const iframe = iframeContainer.createEl("iframe", {
      attr: {
        sandbox: "", // No scripts allowed for security
        srcdoc: this.htmlContent,
      },
    });
    iframe.addClass("gemini-helper-html-preview-iframe");
  }

  private async saveHtml() {
    if (Platform.isMobile) {
      // Mobile: Save as .md file with code block (download doesn't work on mobile)
      try {
        const fileName = `infographic-${this.baseName}-${Date.now()}.md`;
        const folderPath = "GeminiHelper/infographics";
        const mdContent = `\`\`\`html\n${this.htmlContent}\n\`\`\``;

        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
          await this.app.vault.createFolder(folderPath);
        }

        const filePath = `${folderPath}/${fileName}`;
        await this.app.vault.create(filePath, mdContent);

        new Notice(`Saved to ${filePath}`);
      } catch (error) {
        new Notice(`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    } else {
      // Desktop: Download file
      const blob = new Blob([this.htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `infographic-${this.baseName}-${Date.now()}.html`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Helper function to extract HTML from code block
export function extractHtmlFromCodeBlock(content: string): string | null {
  // Match ```html ... ``` code block
  const htmlBlockRegex = /```html\s*\n([\s\S]*?)```/;
  const match = content.match(htmlBlockRegex);

  if (match && match[1]) {
    let html = match[1].trim();

    // If it doesn't start with <html or <!DOCTYPE, wrap it
    if (!/<\s*html/i.test(html) && !/<\s*!DOCTYPE/i.test(html)) {
      html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
    }

    return html;
  }

  return null;
}
