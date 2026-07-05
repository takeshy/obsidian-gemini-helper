import { createRoot, Root } from "react-dom/client";
import { TextFileView, WorkspaceLeaf, IconName } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { DashboardEditor } from "src/dashboard/DashboardEditor";

export const DASHBOARD_VIEW_TYPE = "hub-dashboard-view";

/**
 * TextFileView for `.dashboard` files. Renders the widget grid editor and
 * persists edits through Obsidian's normal save path (getViewData /
 * requestSave).
 */
export class DashboardView extends TextFileView {
  plugin: GeminiHelperPlugin;
  reactRoot: Root | null = null;
  private currentData: string = "";

  constructor(leaf: WorkspaceLeaf, plugin: GeminiHelperPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename || "Dashboard";
  }

  getIcon(): IconName {
    return "layout-dashboard";
  }

  getViewData(): string {
    return this.currentData;
  }

  setViewData(data: string, clear: boolean): void {
    const changed = data !== this.currentData;
    this.currentData = data;
    if (clear) {
      this.reactRoot?.unmount();
      this.reactRoot = null;
    }
    // Only (re)render on external/load changes — our own edits update
    // currentData directly without going through setViewData, so they never
    // trigger a remount (which would reset edit mode / undo history).
    if (!this.reactRoot || clear || changed) {
      this.renderContent();
    }
  }

  clear(): void {
    this.currentData = "";
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.contentEl.empty();
  }

  private renderContent(): void {
    this.reactRoot?.unmount();
    this.reactRoot = null;

    const container = this.contentEl;
    container.empty();
    container.addClass("llm-hub-dashboard-container");

    const root = createRoot(container);
    root.render(
      <DashboardEditor
        plugin={this.plugin}
        sourcePath={this.file?.path || ""}
        fileName={this.file?.basename || ""}
        yamlContent={this.currentData}
        onYamlChange={(yaml: string) => {
          this.currentData = yaml;
          this.requestSave();
        }}
        onOpenDashboard={(file) => this.leaf.openFile(file)}
      />
    );
    this.reactRoot = root;
  }

  async onClose(): Promise<void> {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    await Promise.resolve();
  }
}
