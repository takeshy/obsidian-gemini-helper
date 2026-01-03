import { Modal, App, MarkdownRenderer, Component } from "obsidian";

/**
 * Modal for confirming file edits before writing
 * Shows file path, mode, and content preview
 * Resizable and draggable like HTMLPreviewModal
 */
export class EditConfirmationModal extends Modal {
  private filePath: string;
  private content: string;
  private mode: string;
  private resolvePromise: ((value: boolean) => void) | null = null;
  private component: Component;

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private modalStartX = 0;
  private modalStartY = 0;

  // Resize state
  private isResizing = false;
  private resizeDirection = "";
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;

  constructor(app: App, filePath: string, content: string, mode: string) {
    super(app);
    this.filePath = filePath;
    this.content = content;
    this.mode = mode;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl, modalEl } = this;

    // Add modal classes for styling
    modalEl.addClass("gemini-helper-edit-confirm-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: "Confirm file write" });

    const modeLabel = this.getModeLabel();
    titleRow.createEl("span", {
      text: modeLabel,
      cls: "gemini-helper-edit-confirm-mode",
    });

    // File path display
    const pathRow = header.createDiv({ cls: "gemini-helper-edit-confirm-path" });
    pathRow.createEl("span", { text: "File: " });
    pathRow.createEl("strong", { text: this.filePath });

    // Content preview
    const previewContainer = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-preview",
    });

    const previewLabel = previewContainer.createDiv({
      cls: "gemini-helper-edit-confirm-preview-label",
    });
    previewLabel.createEl("span", { text: "Content preview:" });

    const previewContent = previewContainer.createDiv({
      cls: "gemini-helper-edit-confirm-preview-content",
    });

    // Render markdown preview
    this.component.load();
    void MarkdownRenderer.render(
      this.app,
      this.content,
      previewContent,
      "",
      this.component
    );

    // Action buttons
    const actions = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-actions",
    });

    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.(false);
      this.close();
    });

    const confirmBtn = actions.createEl("button", {
      text: "Confirm",
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      this.resolvePromise?.(true);
      this.close();
    });

    // Add resize handles
    this.addResizeHandles(modalEl);

    // Setup drag functionality
    this.setupDrag(header, modalEl);
  }

  private getModeLabel(): string {
    switch (this.mode) {
      case "create":
        return "Create new file";
      case "append":
        return "Append to file";
      case "overwrite":
        return "Overwrite file";
      default:
        return this.mode;
    }
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
      if ((e.target as HTMLElement).tagName === "BUTTON") return;

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = modalEl.getBoundingClientRect();
      this.modalStartX = rect.left;
      this.modalStartY = rect.top;

      modalEl.setCssProps({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;

      modalEl.setCssProps({
        left: `${this.modalStartX + deltaX}px`,
        top: `${this.modalStartY + deltaY}px`,
      });
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

      modalEl.setCssProps({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });

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

      if (dir.includes("e")) {
        newWidth = Math.max(400, this.resizeStartWidth + deltaX);
      }
      if (dir.includes("w")) {
        newWidth = Math.max(400, this.resizeStartWidth - deltaX);
        newLeft = this.modalStartX + (this.resizeStartWidth - newWidth);
      }
      if (dir.includes("s")) {
        newHeight = Math.max(300, this.resizeStartHeight + deltaY);
      }
      if (dir.includes("n")) {
        newHeight = Math.max(300, this.resizeStartHeight - deltaY);
        newTop = this.modalStartY + (this.resizeStartHeight - newHeight);
      }

      modalEl.setCssProps({
        width: `${newWidth}px`,
        height: `${newHeight}px`,
        left: `${newLeft}px`,
        top: `${newTop}px`,
      });
    };

    const onMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
    // If closed without clicking a button, treat as cancel
    this.resolvePromise?.(false);
  }

  /**
   * Open the modal and wait for user response
   * @returns Promise<boolean> - true if confirmed, false if cancelled
   */
  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

/**
 * Helper function to prompt for confirmation
 * @param app - Obsidian App instance
 * @param filePath - Target file path
 * @param content - Content to be written
 * @param mode - Write mode (create, append, overwrite)
 * @returns Promise<boolean> - true if confirmed, false if cancelled
 */
export function promptForConfirmation(
  app: App,
  filePath: string,
  content: string,
  mode: string
): Promise<boolean> {
  const modal = new EditConfirmationModal(app, filePath, content, mode);
  return modal.openAndWait();
}

/**
 * Modal for confirming file deletion
 * Shows file path, content preview, and asks for confirmation
 * Resizable and draggable like EditConfirmationModal
 */
export class DeleteConfirmationModal extends Modal {
  private filePath: string;
  private content: string;
  private resolvePromise: ((value: boolean) => void) | null = null;
  private component: Component;

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private modalStartX = 0;
  private modalStartY = 0;

  // Resize state
  private isResizing = false;
  private resizeDirection = "";
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;

  constructor(app: App, filePath: string, content: string) {
    super(app);
    this.filePath = filePath;
    this.content = content;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl, modalEl } = this;

    // Add modal classes for styling
    modalEl.addClass("gemini-helper-delete-confirm-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: "Confirm file deletion" });

    const warningLabel = titleRow.createEl("span", {
      cls: "gemini-helper-delete-confirm-warning-label",
    });
    warningLabel.createSpan({ text: "⚠️ " });
    warningLabel.createSpan({ text: "Move to trash" });
    warningLabel.setCssStyles({ color: "var(--text-error)" });

    // File path display
    const pathRow = header.createDiv({ cls: "gemini-helper-edit-confirm-path" });
    pathRow.createEl("span", { text: "File: " });
    pathRow.createEl("strong", { text: this.filePath });

    // Content preview
    const previewContainer = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-preview",
    });

    const previewLabel = previewContainer.createDiv({
      cls: "gemini-helper-edit-confirm-preview-label",
    });
    previewLabel.createEl("span", { text: "Content to be deleted:" });

    const previewContent = previewContainer.createDiv({
      cls: "gemini-helper-edit-confirm-preview-content",
    });

    // Render markdown preview
    this.component.load();
    void MarkdownRenderer.render(
      this.app,
      this.content,
      previewContent,
      "",
      this.component
    );

    // Action buttons
    const actions = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-actions",
    });

    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.(false);
      this.close();
    });

    const deleteBtn = actions.createEl("button", {
      text: "Delete",
      cls: "mod-warning",
    });
    deleteBtn.addEventListener("click", () => {
      this.resolvePromise?.(true);
      this.close();
    });

    // Add resize handles
    this.addResizeHandles(modalEl);

    // Setup drag functionality
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
      if ((e.target as HTMLElement).tagName === "BUTTON") return;

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = modalEl.getBoundingClientRect();
      this.modalStartX = rect.left;
      this.modalStartY = rect.top;

      modalEl.setCssProps({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;

      modalEl.setCssProps({
        left: `${this.modalStartX + deltaX}px`,
        top: `${this.modalStartY + deltaY}px`,
      });
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

      modalEl.setCssProps({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });

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

      if (dir.includes("e")) {
        newWidth = Math.max(400, this.resizeStartWidth + deltaX);
      }
      if (dir.includes("w")) {
        newWidth = Math.max(400, this.resizeStartWidth - deltaX);
        newLeft = this.modalStartX + (this.resizeStartWidth - newWidth);
      }
      if (dir.includes("s")) {
        newHeight = Math.max(300, this.resizeStartHeight + deltaY);
      }
      if (dir.includes("n")) {
        newHeight = Math.max(300, this.resizeStartHeight - deltaY);
        newTop = this.modalStartY + (this.resizeStartHeight - newHeight);
      }

      modalEl.setCssProps({
        width: `${newWidth}px`,
        height: `${newHeight}px`,
        left: `${newLeft}px`,
        top: `${newTop}px`,
      });
    };

    const onMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
    // If closed without clicking a button, treat as cancel
    this.resolvePromise?.(false);
  }

  /**
   * Open the modal and wait for user response
   * @returns Promise<boolean> - true if confirmed, false if cancelled
   */
  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

/**
 * Helper function to prompt for delete confirmation
 * @param app - Obsidian App instance
 * @param filePath - Target file path to delete
 * @param content - Content of the file to be deleted (for preview)
 * @returns Promise<boolean> - true if confirmed, false if cancelled
 */
export function promptForDeleteConfirmation(
  app: App,
  filePath: string,
  content: string
): Promise<boolean> {
  const modal = new DeleteConfirmationModal(app, filePath, content);
  return modal.openAndWait();
}

/**
 * Item structure for bulk edit confirmation
 */
export interface BulkEditConfirmItem {
  path: string;
  originalContent: string;
  newContent: string;
  mode: "replace" | "append" | "prepend";
}

/**
 * Modal for confirming bulk file edits
 * Shows a list of files with checkboxes and content preview
 */
export class BulkEditConfirmationModal extends Modal {
  private items: BulkEditConfirmItem[];
  private selectedPaths: Set<string>;
  private resolvePromise: ((value: string[]) => void) | null = null;
  private component: Component;
  private expandedPaths: Set<string> = new Set();

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private modalStartX = 0;
  private modalStartY = 0;

  // Resize state
  private isResizing = false;
  private resizeDirection = "";
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;

  constructor(app: App, items: BulkEditConfirmItem[]) {
    super(app);
    this.items = items;
    this.selectedPaths = new Set(items.map((i) => i.path));
    this.component = new Component();
  }

  onOpen() {
    const { contentEl, modalEl } = this;

    modalEl.addClass("gemini-helper-bulk-confirm-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: `Confirm bulk edit (${this.items.length} files)` });

    // Selection controls
    const selectionControls = header.createDiv({ cls: "gemini-helper-bulk-selection-controls" });

    const selectAllBtn = selectionControls.createEl("button", { text: "Select all" });
    selectAllBtn.addEventListener("click", () => {
      this.items.forEach((item) => this.selectedPaths.add(item.path));
      this.updateCheckboxes();
    });

    const deselectAllBtn = selectionControls.createEl("button", { text: "Deselect all" });
    deselectAllBtn.addEventListener("click", () => {
      this.selectedPaths.clear();
      this.updateCheckboxes();
    });

    // File list container
    const listContainer = contentEl.createDiv({
      cls: "gemini-helper-bulk-list-container",
    });

    this.component.load();
    this.renderFileList(listContainer);

    // Action buttons
    const actions = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-actions",
    });

    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.([]);
      this.close();
    });

    const confirmBtn = actions.createEl("button", {
      text: `Apply (${this.selectedPaths.size})`,
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      this.resolvePromise?.(Array.from(this.selectedPaths));
      this.close();
    });

    // Store reference for updating button text
    (this as { confirmBtn?: HTMLButtonElement }).confirmBtn = confirmBtn;

    // Add resize handles
    this.addResizeHandles(modalEl);

    // Setup drag functionality
    this.setupDrag(header, modalEl);
  }

  private renderFileList(container: HTMLElement) {
    container.empty();

    for (const item of this.items) {
      const fileRow = container.createDiv({ cls: "gemini-helper-bulk-file-row" });

      // Checkbox
      const checkbox = fileRow.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selectedPaths.has(item.path);
      checkbox.dataset.path = item.path;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedPaths.add(item.path);
        } else {
          this.selectedPaths.delete(item.path);
        }
        this.updateApplyButton();
      });

      // File info
      const fileInfo = fileRow.createDiv({ cls: "gemini-helper-bulk-file-info" });

      const pathEl = fileInfo.createDiv({ cls: "gemini-helper-bulk-file-path" });
      pathEl.createEl("span", { text: item.path });

      const modeLabel = this.getModeLabel(item.mode);
      pathEl.createEl("span", {
        text: modeLabel,
        cls: "gemini-helper-bulk-file-mode",
      });

      // Expand/collapse button
      const expandBtn = fileInfo.createEl("button", {
        text: this.expandedPaths.has(item.path) ? "Hide" : "Preview",
        cls: "gemini-helper-bulk-expand-btn",
      });
      expandBtn.addEventListener("click", () => {
        if (this.expandedPaths.has(item.path)) {
          this.expandedPaths.delete(item.path);
          expandBtn.textContent = "Preview";
          const preview = fileRow.querySelector(".gemini-helper-bulk-preview");
          preview?.remove();
        } else {
          this.expandedPaths.add(item.path);
          expandBtn.textContent = "Hide";
          this.renderPreview(fileRow, item);
        }
      });

      // Show preview if expanded
      if (this.expandedPaths.has(item.path)) {
        this.renderPreview(fileRow, item);
      }
    }
  }

  private renderPreview(container: HTMLElement, item: BulkEditConfirmItem) {
    const preview = container.createDiv({ cls: "gemini-helper-bulk-preview" });

    const previewContent = preview.createDiv({
      cls: "gemini-helper-edit-confirm-preview-content",
    });

    void MarkdownRenderer.render(
      this.app,
      item.newContent,
      previewContent,
      "",
      this.component
    );
  }

  private getModeLabel(mode: string): string {
    switch (mode) {
      case "append":
        return "Append";
      case "prepend":
        return "Prepend";
      case "replace":
      default:
        return "Replace";
    }
  }

  private updateCheckboxes() {
    const checkboxes = this.contentEl.querySelectorAll<HTMLInputElement>(
      "input[type='checkbox']"
    );
    checkboxes.forEach((cb) => {
      const path = cb.dataset.path;
      if (path) {
        cb.checked = this.selectedPaths.has(path);
      }
    });
    this.updateApplyButton();
  }

  private updateApplyButton() {
    const confirmBtn = (this as { confirmBtn?: HTMLButtonElement }).confirmBtn;
    if (confirmBtn) {
      confirmBtn.textContent = `Apply (${this.selectedPaths.size})`;
    }
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
      if ((e.target as HTMLElement).tagName === "BUTTON") return;

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = modalEl.getBoundingClientRect();
      this.modalStartX = rect.left;
      this.modalStartY = rect.top;

      modalEl.setCssProps({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;

      modalEl.setCssProps({
        left: `${this.modalStartX + deltaX}px`,
        top: `${this.modalStartY + deltaY}px`,
      });
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

      modalEl.setCssProps({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });

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

      if (dir.includes("e")) {
        newWidth = Math.max(500, this.resizeStartWidth + deltaX);
      }
      if (dir.includes("w")) {
        newWidth = Math.max(500, this.resizeStartWidth - deltaX);
        newLeft = this.modalStartX + (this.resizeStartWidth - newWidth);
      }
      if (dir.includes("s")) {
        newHeight = Math.max(400, this.resizeStartHeight + deltaY);
      }
      if (dir.includes("n")) {
        newHeight = Math.max(400, this.resizeStartHeight - deltaY);
        newTop = this.modalStartY + (this.resizeStartHeight - newHeight);
      }

      modalEl.setCssProps({
        width: `${newWidth}px`,
        height: `${newHeight}px`,
        left: `${newLeft}px`,
        top: `${newTop}px`,
      });
    };

    const onMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
    this.resolvePromise?.([]);
  }

  openAndWait(): Promise<string[]> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

/**
 * Helper function to prompt for bulk edit confirmation
 * @returns Promise<string[]> - Array of selected file paths to apply
 */
export function promptForBulkEditConfirmation(
  app: App,
  items: BulkEditConfirmItem[]
): Promise<string[]> {
  const modal = new BulkEditConfirmationModal(app, items);
  return modal.openAndWait();
}

/**
 * Item structure for bulk delete confirmation
 */
export interface BulkDeleteConfirmItem {
  path: string;
  fileName: string;
  content: string;
}

/**
 * Modal for confirming bulk file deletions
 * Shows a list of files with checkboxes and content preview
 */
export class BulkDeleteConfirmationModal extends Modal {
  private items: BulkDeleteConfirmItem[];
  private selectedPaths: Set<string>;
  private resolvePromise: ((value: string[]) => void) | null = null;
  private component: Component;
  private expandedPaths: Set<string> = new Set();

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private modalStartX = 0;
  private modalStartY = 0;

  // Resize state
  private isResizing = false;
  private resizeDirection = "";
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;

  constructor(app: App, items: BulkDeleteConfirmItem[]) {
    super(app);
    this.items = items;
    this.selectedPaths = new Set(items.map((i) => i.path));
    this.component = new Component();
  }

  onOpen() {
    const { contentEl, modalEl } = this;

    modalEl.addClass("gemini-helper-bulk-confirm-modal");
    modalEl.addClass("gemini-helper-bulk-delete-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: `Confirm bulk delete (${this.items.length} files)` });

    const warningLabel = titleRow.createEl("span", {
      cls: "gemini-helper-delete-confirm-warning-label",
    });
    warningLabel.createSpan({ text: "⚠️ " });
    warningLabel.createSpan({ text: "Move to trash" });
    warningLabel.setCssStyles({ color: "var(--text-error)" });

    // Selection controls
    const selectionControls = header.createDiv({ cls: "gemini-helper-bulk-selection-controls" });

    const selectAllBtn = selectionControls.createEl("button", { text: "Select all" });
    selectAllBtn.addEventListener("click", () => {
      this.items.forEach((item) => this.selectedPaths.add(item.path));
      this.updateCheckboxes();
    });

    const deselectAllBtn = selectionControls.createEl("button", { text: "Deselect all" });
    deselectAllBtn.addEventListener("click", () => {
      this.selectedPaths.clear();
      this.updateCheckboxes();
    });

    // File list container
    const listContainer = contentEl.createDiv({
      cls: "gemini-helper-bulk-list-container",
    });

    this.component.load();
    this.renderFileList(listContainer);

    // Action buttons
    const actions = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-actions",
    });

    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.([]);
      this.close();
    });

    const deleteBtn = actions.createEl("button", {
      text: `Delete (${this.selectedPaths.size})`,
      cls: "mod-warning",
    });
    deleteBtn.addEventListener("click", () => {
      this.resolvePromise?.(Array.from(this.selectedPaths));
      this.close();
    });

    // Store reference for updating button text
    (this as { deleteBtn?: HTMLButtonElement }).deleteBtn = deleteBtn;

    // Add resize handles
    this.addResizeHandles(modalEl);

    // Setup drag functionality
    this.setupDrag(header, modalEl);
  }

  private renderFileList(container: HTMLElement) {
    container.empty();

    for (const item of this.items) {
      const fileRow = container.createDiv({ cls: "gemini-helper-bulk-file-row" });

      // Checkbox
      const checkbox = fileRow.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selectedPaths.has(item.path);
      checkbox.dataset.path = item.path;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedPaths.add(item.path);
        } else {
          this.selectedPaths.delete(item.path);
        }
        this.updateDeleteButton();
      });

      // File info
      const fileInfo = fileRow.createDiv({ cls: "gemini-helper-bulk-file-info" });

      const pathEl = fileInfo.createDiv({ cls: "gemini-helper-bulk-file-path" });
      pathEl.createEl("span", { text: item.path });

      // Expand/collapse button
      const expandBtn = fileInfo.createEl("button", {
        text: this.expandedPaths.has(item.path) ? "Hide" : "Preview",
        cls: "gemini-helper-bulk-expand-btn",
      });
      expandBtn.addEventListener("click", () => {
        if (this.expandedPaths.has(item.path)) {
          this.expandedPaths.delete(item.path);
          expandBtn.textContent = "Preview";
          const preview = fileRow.querySelector(".gemini-helper-bulk-preview");
          preview?.remove();
        } else {
          this.expandedPaths.add(item.path);
          expandBtn.textContent = "Hide";
          this.renderPreview(fileRow, item);
        }
      });

      // Show preview if expanded
      if (this.expandedPaths.has(item.path)) {
        this.renderPreview(fileRow, item);
      }
    }
  }

  private renderPreview(container: HTMLElement, item: BulkDeleteConfirmItem) {
    const preview = container.createDiv({ cls: "gemini-helper-bulk-preview" });

    const previewContent = preview.createDiv({
      cls: "gemini-helper-edit-confirm-preview-content",
    });

    void MarkdownRenderer.render(
      this.app,
      item.content,
      previewContent,
      "",
      this.component
    );
  }

  private updateCheckboxes() {
    const checkboxes = this.contentEl.querySelectorAll<HTMLInputElement>(
      "input[type='checkbox']"
    );
    checkboxes.forEach((cb) => {
      const path = cb.dataset.path;
      if (path) {
        cb.checked = this.selectedPaths.has(path);
      }
    });
    this.updateDeleteButton();
  }

  private updateDeleteButton() {
    const deleteBtn = (this as { deleteBtn?: HTMLButtonElement }).deleteBtn;
    if (deleteBtn) {
      deleteBtn.textContent = `Delete (${this.selectedPaths.size})`;
    }
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
      if ((e.target as HTMLElement).tagName === "BUTTON") return;

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = modalEl.getBoundingClientRect();
      this.modalStartX = rect.left;
      this.modalStartY = rect.top;

      modalEl.setCssProps({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;

      modalEl.setCssProps({
        left: `${this.modalStartX + deltaX}px`,
        top: `${this.modalStartY + deltaY}px`,
      });
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

      modalEl.setCssProps({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });

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

      if (dir.includes("e")) {
        newWidth = Math.max(500, this.resizeStartWidth + deltaX);
      }
      if (dir.includes("w")) {
        newWidth = Math.max(500, this.resizeStartWidth - deltaX);
        newLeft = this.modalStartX + (this.resizeStartWidth - newWidth);
      }
      if (dir.includes("s")) {
        newHeight = Math.max(400, this.resizeStartHeight + deltaY);
      }
      if (dir.includes("n")) {
        newHeight = Math.max(400, this.resizeStartHeight - deltaY);
        newTop = this.modalStartY + (this.resizeStartHeight - newHeight);
      }

      modalEl.setCssProps({
        width: `${newWidth}px`,
        height: `${newHeight}px`,
        left: `${newLeft}px`,
        top: `${newTop}px`,
      });
    };

    const onMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
    this.resolvePromise?.([]);
  }

  openAndWait(): Promise<string[]> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

/**
 * Helper function to prompt for bulk delete confirmation
 * @returns Promise<string[]> - Array of selected file paths to delete
 */
export function promptForBulkDeleteConfirmation(
  app: App,
  items: BulkDeleteConfirmItem[]
): Promise<string[]> {
  const modal = new BulkDeleteConfirmationModal(app, items);
  return modal.openAndWait();
}
