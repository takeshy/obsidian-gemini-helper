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
  private isDragging = false;
  private isResizing = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private modalStartX = 0;
  private modalStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeDirection = "";

  constructor(app: App, htmlContent: string, baseName: string) {
    super(app);
    this.htmlContent = htmlContent;
    this.baseName = sanitizeFileName(baseName);
  }

  onOpen() {
    const { contentEl, modalEl } = this;

    // Make modal larger and resizable
    modalEl.addClass("gemini-helper-html-preview-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header with actions (also serves as drag handle)
    const header = contentEl.createDiv({ cls: "gemini-helper-html-preview-header gemini-helper-drag-handle" });

    const title = header.createEl("h3", { text: "Infographic preview" });
    title.style.margin = "0";

    const actions = header.createDiv({ cls: "gemini-helper-html-preview-actions" });

    // Copy HTML button
    const copyBtn = actions.createEl("button", { text: "Copy code", cls: "mod-cta" });
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

    // Add resize handles
    this.addResizeHandles(modalEl);

    // Setup drag functionality on header
    this.setupDrag(header, modalEl);
  }

  private addResizeHandles(modalEl: HTMLElement) {
    const directions = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
    for (const dir of directions) {
      const handle = document.createElement("div");
      handle.className = `gemini-helper-resize-handle gemini-helper-resize-${dir}`;
      handle.dataset.direction = dir;
      modalEl.appendChild(handle);
      this.setupResize(handle, modalEl, dir);
    }
  }

  private setupDrag(header: HTMLElement, modalEl: HTMLElement) {
    const onMouseDown = (e: MouseEvent) => {
      // Don't drag if clicking on buttons
      if ((e.target as HTMLElement).tagName === "BUTTON") return;

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = modalEl.getBoundingClientRect();
      this.modalStartX = rect.left;
      this.modalStartY = rect.top;

      // Remove default positioning
      modalEl.style.position = "fixed";
      modalEl.style.margin = "0";
      modalEl.style.transform = "none";
      modalEl.style.left = `${rect.left}px`;
      modalEl.style.top = `${rect.top}px`;

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;

      modalEl.style.left = `${this.modalStartX + deltaX}px`;
      modalEl.style.top = `${this.modalStartY + deltaY}px`;
    };

    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    header.addEventListener("mousedown", onMouseDown);
  }

  private setupResize(handle: HTMLElement, modalEl: HTMLElement, direction: string) {
    const onMouseDown = (e: MouseEvent) => {
      this.isResizing = true;
      this.resizeDirection = direction;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = modalEl.getBoundingClientRect();
      this.resizeStartWidth = rect.width;
      this.resizeStartHeight = rect.height;
      this.modalStartX = rect.left;
      this.modalStartY = rect.top;

      // Set fixed positioning if not already
      modalEl.style.position = "fixed";
      modalEl.style.margin = "0";
      modalEl.style.transform = "none";
      modalEl.style.left = `${rect.left}px`;
      modalEl.style.top = `${rect.top}px`;
      modalEl.style.width = `${rect.width}px`;
      modalEl.style.height = `${rect.height}px`;

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isResizing) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      const dir = this.resizeDirection;

      let newWidth = this.resizeStartWidth;
      let newHeight = this.resizeStartHeight;
      let newLeft = this.modalStartX;
      let newTop = this.modalStartY;

      // Handle horizontal resize
      if (dir.includes("e")) {
        newWidth = Math.max(400, this.resizeStartWidth + deltaX);
      }
      if (dir.includes("w")) {
        newWidth = Math.max(400, this.resizeStartWidth - deltaX);
        newLeft = this.modalStartX + (this.resizeStartWidth - newWidth);
      }

      // Handle vertical resize
      if (dir.includes("s")) {
        newHeight = Math.max(300, this.resizeStartHeight + deltaY);
      }
      if (dir.includes("n")) {
        newHeight = Math.max(300, this.resizeStartHeight - deltaY);
        newTop = this.modalStartY + (this.resizeStartHeight - newHeight);
      }

      modalEl.style.width = `${newWidth}px`;
      modalEl.style.height = `${newHeight}px`;
      modalEl.style.left = `${newLeft}px`;
      modalEl.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
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
