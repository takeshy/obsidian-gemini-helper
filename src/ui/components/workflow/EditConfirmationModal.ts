import { Modal, App, MarkdownRenderer, Component } from "obsidian";
import { t } from "src/i18n";

/**
 * Diff line types
 */
export type DiffLineType = "unchanged" | "added" | "removed";

/**
 * Represents a single line in the diff output
 */
export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

/**
 * Calculate line-based diff between two strings using LCS algorithm
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack to get diff
  let i = m;
  let j = n;
  const diffStack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffStack.push({
        type: "unchanged",
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      diffStack.push({
        type: "added",
        content: newLines[j - 1],
        newLineNum: j,
      });
      j--;
    } else {
      diffStack.push({
        type: "removed",
        content: oldLines[i - 1],
        oldLineNum: i,
      });
      i--;
    }
  }

  // Reverse to get correct order
  while (diffStack.length > 0) {
    result.push(diffStack.pop()!);
  }

  return result;
}

/**
 * Result type for edit confirmation
 */
export interface EditConfirmationResult {
  confirmed: boolean;
  additionalRequest?: string;
}

/**
 * Modal for confirming file edits before writing
 * Shows file path, mode, and content preview
 * Resizable and draggable like HTMLPreviewModal
 */
export class EditConfirmationModal extends Modal {
  private filePath: string;
  private content: string;
  private originalContent: string;
  private mode: string;
  private resolvePromise: ((value: EditConfirmationResult) => void) | null = null;
  private component: Component;
  private isShowingAdditionalRequest = false;
  private additionalRequestEl: HTMLTextAreaElement | null = null;
  private requestChangesBtn: HTMLButtonElement | null = null;

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

  constructor(app: App, filePath: string, content: string, mode: string, originalContent?: string) {
    super(app);
    this.filePath = filePath;
    this.content = content;
    this.originalContent = originalContent || "";
    this.mode = mode;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl, modalEl, containerEl } = this;

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    // Add modal classes for styling
    modalEl.addClass("gemini-helper-edit-confirm-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: t("workflowModal.confirmFileWrite") });

    const modeLabel = this.getModeLabel();
    titleRow.createEl("span", {
      text: modeLabel,
      cls: "gemini-helper-edit-confirm-mode",
    });

    // File path display
    const pathRow = header.createDiv({ cls: "gemini-helper-edit-confirm-path" });
    pathRow.createEl("span", { text: t("workflowModal.file") });
    pathRow.createEl("strong", { text: this.filePath });

    // Content preview
    const previewContainer = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-preview",
    });

    const previewLabel = previewContainer.createDiv({
      cls: "gemini-helper-edit-confirm-preview-label",
    });
    previewLabel.createEl("span", { text: t("workflowModal.changes") });

    const previewContent = previewContainer.createDiv({
      cls: "gemini-helper-edit-confirm-preview-content",
    });

    // Render diff view if we have original content, otherwise render markdown preview
    this.component.load();
    if (this.originalContent || this.mode === "create") {
      // For new files or when we have original content, show diff
      const diffLines = computeLineDiff(this.originalContent, this.content);
      const diffContainer = previewContent.createDiv({ cls: "gemini-helper-diff-view" });

      for (const line of diffLines) {
        const lineEl = diffContainer.createDiv({
          cls: `gemini-helper-diff-line gemini-helper-diff-${line.type}`,
        });

        // Line number gutter
        const gutterEl = lineEl.createSpan({ cls: "gemini-helper-diff-gutter" });
        if (line.type === "removed") {
          gutterEl.textContent = "-";
        } else if (line.type === "added") {
          gutterEl.textContent = "+";
        } else {
          gutterEl.textContent = " ";
        }

        // Line content
        const lineContentEl = lineEl.createSpan({ cls: "gemini-helper-diff-content" });
        lineContentEl.textContent = line.content || " "; // Empty lines show space
      }
    } else {
      // Fallback to markdown preview if no original content
      void MarkdownRenderer.render(
        this.app,
        this.content,
        previewContent,
        "",
        this.component
      );
    }

    // Additional request textarea (hidden initially)
    const additionalRequestContainer = contentEl.createDiv({
      cls: "gemini-helper-edit-additional-container gemini-helper-hidden",
    });

    additionalRequestContainer.createEl("label", {
      text: t("message.additionalPlaceholder"),
      cls: "gemini-helper-edit-additional-label",
    });

    this.additionalRequestEl = additionalRequestContainer.createEl("textarea", {
      cls: "gemini-helper-edit-additional-input",
      placeholder: t("message.additionalPlaceholder"),
    });
    this.additionalRequestEl.rows = 3;

    // Action buttons
    const actions = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-actions",
    });

    const cancelBtn = actions.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.({ confirmed: false });
      this.close();
    });

    this.requestChangesBtn = actions.createEl("button", {
      text: t("message.requestChanges"),
      cls: "mod-warning",
    });
    this.requestChangesBtn.addEventListener("click", () => {
      if (this.isShowingAdditionalRequest) {
        // Second click: submit with additional request
        const additionalRequest = this.additionalRequestEl?.value || "";
        this.resolvePromise?.({
          confirmed: false,
          additionalRequest,
        });
        this.close();
      } else {
        // First click: show textarea
        this.isShowingAdditionalRequest = true;
        additionalRequestContainer.removeClass("gemini-helper-hidden");
        if (this.requestChangesBtn) {
          this.requestChangesBtn.textContent = t("message.regenerate");
        }
        this.additionalRequestEl?.focus();
      }
    });

    const confirmBtn = actions.createEl("button", {
      text: t("message.apply"),
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      this.resolvePromise?.({ confirmed: true });
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
        return t("workflowModal.createNewFile");
      case "append":
        return t("workflowModal.appendToFile");
      case "overwrite":
        return t("workflowModal.overwriteFile");
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
    this.resolvePromise?.({ confirmed: false });
  }

  /**
   * Open the modal and wait for user response
   * @returns Promise<EditConfirmationResult> - result with confirmed status and optional additional request
   */
  openAndWait(): Promise<EditConfirmationResult> {
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
 * @param originalContent - Original content for diff display (optional)
 * @returns Promise<EditConfirmationResult> - result with confirmed status and optional additional request
 */
export function promptForConfirmation(
  app: App,
  filePath: string,
  content: string,
  mode: string,
  originalContent?: string
): Promise<EditConfirmationResult> {
  const modal = new EditConfirmationModal(app, filePath, content, mode, originalContent);
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
    const { contentEl, modalEl, containerEl } = this;

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    // Add modal classes for styling
    modalEl.addClass("gemini-helper-delete-confirm-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: t("workflowModal.confirmFileDeletion") });

    const warningLabel = titleRow.createEl("span", {
      cls: "gemini-helper-delete-confirm-warning-label",
    });
    warningLabel.createSpan({ text: "⚠️ " });
    warningLabel.createSpan({ text: t("workflowModal.moveToTrash") });
    warningLabel.setCssStyles({ color: "var(--text-error)" });

    // File path display
    const pathRow = header.createDiv({ cls: "gemini-helper-edit-confirm-path" });
    pathRow.createEl("span", { text: t("workflowModal.file") });
    pathRow.createEl("strong", { text: this.filePath });

    // Content preview
    const previewContainer = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-preview",
    });

    const previewLabel = previewContainer.createDiv({
      cls: "gemini-helper-edit-confirm-preview-label",
    });
    previewLabel.createEl("span", { text: t("workflowModal.contentToBeDeleted") });

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

    const cancelBtn = actions.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.(false);
      this.close();
    });

    const deleteBtn = actions.createEl("button", {
      text: t("workflowModal.delete"),
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
    const { contentEl, modalEl, containerEl } = this;

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    modalEl.addClass("gemini-helper-bulk-confirm-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: t("workflowModal.confirmBulkEdit", { count: String(this.items.length) }) });

    // Selection controls
    const selectionControls = header.createDiv({ cls: "gemini-helper-bulk-selection-controls" });

    const selectAllBtn = selectionControls.createEl("button", { text: t("workflowModal.selectAll") });
    selectAllBtn.addEventListener("click", () => {
      this.items.forEach((item) => this.selectedPaths.add(item.path));
      this.updateCheckboxes();
    });

    const deselectAllBtn = selectionControls.createEl("button", { text: t("workflowModal.deselectAll") });
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

    const cancelBtn = actions.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.([]);
      this.close();
    });

    const confirmBtn = actions.createEl("button", {
      text: t("workflowModal.apply", { count: String(this.selectedPaths.size) }),
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
        text: this.expandedPaths.has(item.path) ? t("workflowModal.hide") : t("workflowModal.preview"),
        cls: "gemini-helper-bulk-expand-btn",
      });
      expandBtn.addEventListener("click", () => {
        if (this.expandedPaths.has(item.path)) {
          this.expandedPaths.delete(item.path);
          expandBtn.textContent = t("workflowModal.preview");
          const preview = fileRow.querySelector(".gemini-helper-bulk-preview");
          preview?.remove();
        } else {
          this.expandedPaths.add(item.path);
          expandBtn.textContent = t("workflowModal.hide");
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

    // Compute and render diff
    const diffLines = computeLineDiff(item.originalContent, item.newContent);
    const diffContainer = preview.createDiv({ cls: "gemini-helper-diff-view" });

    for (const line of diffLines) {
      const lineEl = diffContainer.createDiv({
        cls: `gemini-helper-diff-line gemini-helper-diff-${line.type}`,
      });

      // Line number gutter
      const gutterEl = lineEl.createSpan({ cls: "gemini-helper-diff-gutter" });
      if (line.type === "removed") {
        gutterEl.textContent = "-";
      } else if (line.type === "added") {
        gutterEl.textContent = "+";
      } else {
        gutterEl.textContent = " ";
      }

      // Line content
      const contentEl = lineEl.createSpan({ cls: "gemini-helper-diff-content" });
      contentEl.textContent = line.content || " "; // Empty lines show space
    }
  }

  private getModeLabel(mode: string): string {
    switch (mode) {
      case "append":
        return t("workflowModal.append");
      case "prepend":
        return t("workflowModal.prepend");
      case "replace":
      default:
        return t("workflowModal.replace");
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
      confirmBtn.textContent = t("workflowModal.apply", { count: String(this.selectedPaths.size) });
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
    const { contentEl, modalEl, containerEl } = this;

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    modalEl.addClass("gemini-helper-bulk-confirm-modal");
    modalEl.addClass("gemini-helper-bulk-delete-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: t("workflowModal.confirmBulkDelete", { count: String(this.items.length) }) });

    const warningLabel = titleRow.createEl("span", {
      cls: "gemini-helper-delete-confirm-warning-label",
    });
    warningLabel.createSpan({ text: "⚠️ " });
    warningLabel.createSpan({ text: t("workflowModal.moveToTrash") });
    warningLabel.setCssStyles({ color: "var(--text-error)" });

    // Selection controls
    const selectionControls = header.createDiv({ cls: "gemini-helper-bulk-selection-controls" });

    const selectAllBtn = selectionControls.createEl("button", { text: t("workflowModal.selectAll") });
    selectAllBtn.addEventListener("click", () => {
      this.items.forEach((item) => this.selectedPaths.add(item.path));
      this.updateCheckboxes();
    });

    const deselectAllBtn = selectionControls.createEl("button", { text: t("workflowModal.deselectAll") });
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

    const cancelBtn = actions.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.([]);
      this.close();
    });

    const deleteBtn = actions.createEl("button", {
      text: t("workflowModal.deleteCount", { count: String(this.selectedPaths.size) }),
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
        text: this.expandedPaths.has(item.path) ? t("workflowModal.hide") : t("workflowModal.preview"),
        cls: "gemini-helper-bulk-expand-btn",
      });
      expandBtn.addEventListener("click", () => {
        if (this.expandedPaths.has(item.path)) {
          this.expandedPaths.delete(item.path);
          expandBtn.textContent = t("workflowModal.preview");
          const preview = fileRow.querySelector(".gemini-helper-bulk-preview");
          preview?.remove();
        } else {
          this.expandedPaths.add(item.path);
          expandBtn.textContent = t("workflowModal.hide");
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
      deleteBtn.textContent = t("workflowModal.deleteCount", { count: String(this.selectedPaths.size) });
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

/**
 * Modal for confirming file rename
 */
export class RenameConfirmationModal extends Modal {
  private originalPath: string;
  private newPath: string;
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(app: App, originalPath: string, newPath: string) {
    super(app);
    this.originalPath = originalPath;
    this.newPath = newPath;
  }

  onOpen() {
    const { contentEl, modalEl, containerEl } = this;

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    modalEl.addClass("gemini-helper-delete-confirm-modal");

    // Header
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header",
    });
    header.createEl("h3", { text: t("workflowModal.confirmFileRename") });

    // Path display
    const pathRow = header.createDiv({ cls: "gemini-helper-edit-confirm-path" });
    pathRow.createEl("span", { text: "📁 " });
    pathRow.createEl("strong", { text: this.originalPath });
    pathRow.createEl("span", { text: " → " });
    pathRow.createEl("strong", { text: this.newPath });

    // Buttons
    const btnContainer = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-actions",
    });

    const applyBtn = btnContainer.createEl("button", {
      text: t("message.apply"),
      cls: "mod-cta",
    });
    applyBtn.addEventListener("click", () => {
      if (this.resolvePromise) {
        this.resolvePromise(true);
        this.resolvePromise = null;
      }
      this.close();
    });

    const cancelBtn = btnContainer.createEl("button", {
      text: t("common.cancel"),
    });
    cancelBtn.addEventListener("click", () => {
      if (this.resolvePromise) {
        this.resolvePromise(false);
        this.resolvePromise = null;
      }
      this.close();
    });
  }

  onClose() {
    if (this.resolvePromise) {
      this.resolvePromise(false);
      this.resolvePromise = null;
    }
    this.contentEl.empty();
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

/**
 * Helper function to prompt for rename confirmation
 */
export function promptForRenameConfirmation(
  app: App,
  originalPath: string,
  newPath: string
): Promise<boolean> {
  const modal = new RenameConfirmationModal(app, originalPath, newPath);
  return modal.openAndWait();
}

/**
 * Item for bulk rename confirmation
 */
export interface BulkRenameConfirmItem {
  originalPath: string;
  newPath: string;
}

/**
 * Modal for confirming bulk file renames
 * Shows a list of renames with checkboxes for selective application
 */
export class BulkRenameConfirmationModal extends Modal {
  private items: BulkRenameConfirmItem[];
  private selectedPaths: Set<string>;
  private resolvePromise: ((value: string[]) => void) | null = null;

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

  constructor(app: App, items: BulkRenameConfirmItem[]) {
    super(app);
    this.items = items;
    this.selectedPaths = new Set(items.map((i) => i.originalPath));
  }

  onOpen() {
    const { contentEl, modalEl, containerEl } = this;

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    modalEl.addClass("gemini-helper-bulk-confirm-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Header (drag handle)
    const header = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-header gemini-helper-drag-handle",
    });

    const titleRow = header.createDiv({ cls: "gemini-helper-edit-confirm-title-row" });
    titleRow.createEl("h3", { text: t("workflowModal.confirmBulkRename", { count: String(this.items.length) }) });

    // Selection controls
    const selectionControls = header.createDiv({ cls: "gemini-helper-bulk-selection-controls" });

    const selectAllBtn = selectionControls.createEl("button", { text: t("workflowModal.selectAll") });
    selectAllBtn.addEventListener("click", () => {
      this.items.forEach((item) => this.selectedPaths.add(item.originalPath));
      this.updateCheckboxes();
    });

    const deselectAllBtn = selectionControls.createEl("button", { text: t("workflowModal.deselectAll") });
    deselectAllBtn.addEventListener("click", () => {
      this.selectedPaths.clear();
      this.updateCheckboxes();
    });

    // File list container
    const listContainer = contentEl.createDiv({
      cls: "gemini-helper-bulk-list-container",
    });

    this.renderFileList(listContainer);

    // Action buttons
    const actions = contentEl.createDiv({
      cls: "gemini-helper-edit-confirm-actions",
    });

    const cancelBtn = actions.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      if (this.resolvePromise) {
        this.resolvePromise([]);
        this.resolvePromise = null;
      }
      this.close();
    });

    const applyBtn = actions.createEl("button", {
      text: t("workflowModal.renameCount", { count: String(this.selectedPaths.size) }),
      cls: "mod-cta",
    });
    applyBtn.addEventListener("click", () => {
      if (this.resolvePromise) {
        this.resolvePromise(Array.from(this.selectedPaths));
        this.resolvePromise = null;
      }
      this.close();
    });

    // Store reference for updating button text
    (this as { applyBtn?: HTMLButtonElement }).applyBtn = applyBtn;

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
      checkbox.checked = this.selectedPaths.has(item.originalPath);
      checkbox.dataset.path = item.originalPath;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedPaths.add(item.originalPath);
        } else {
          this.selectedPaths.delete(item.originalPath);
        }
        this.updateApplyButton();
      });

      // Rename info
      const fileInfo = fileRow.createDiv({ cls: "gemini-helper-bulk-file-info" });
      const pathEl = fileInfo.createDiv({ cls: "gemini-helper-bulk-file-path" });
      pathEl.createEl("span", { text: item.originalPath });
      pathEl.createEl("span", { text: " → ", cls: "gemini-helper-rename-arrow" });
      pathEl.createEl("span", { text: item.newPath, cls: "gemini-helper-rename-new-path" });
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
    const applyBtn = (this as { applyBtn?: HTMLButtonElement }).applyBtn;
    if (applyBtn) {
      applyBtn.textContent = t("workflowModal.renameCount", { count: String(this.selectedPaths.size) });
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
    this.contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise([]);
      this.resolvePromise = null;
    }
  }

  openAndWait(): Promise<string[]> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

/**
 * Helper function to prompt for bulk rename confirmation
 * @returns Promise<string[]> - Array of selected original paths to rename
 */
export function promptForBulkRenameConfirmation(
  app: App,
  items: BulkRenameConfirmItem[]
): Promise<string[]> {
  const modal = new BulkRenameConfirmationModal(app, items);
  return modal.openAndWait();
}
