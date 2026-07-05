import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Menu, TFile } from "obsidian";
import { t } from "src/i18n";
import type { GeminiHelperPlugin } from "src/plugin";
import { DashboardCanvas } from "./DashboardCanvas";
import { parseDashboard, serializeDashboard, createEmptyDashboard } from "./dashboardFile";
import type { DashboardData } from "./types";

interface DashboardEditorProps {
  plugin: GeminiHelperPlugin;
  sourcePath: string;
  fileName: string;
  yamlContent: string;
  /** Persist serialized YAML back to the TextFileView (triggers requestSave). */
  onYamlChange: (yaml: string) => void;
  /** Open another dashboard in the current dashboard view leaf. */
  onOpenDashboard: (file: TFile) => void | Promise<void>;
}

function getDashboardLabel(file: TFile, duplicateBasenames: Set<string>): string {
  return duplicateBasenames.has(file.basename) ? `${file.basename} (${file.path})` : file.basename;
}

/**
 * React bridge between the `.dashboard` TextFileView and the controlled
 * DashboardCanvas. Owns the in-memory DashboardData and serializes back on
 * every mutation.
 */
export function DashboardEditor({
  plugin,
  sourcePath,
  fileName,
  yamlContent,
  onYamlChange,
  onOpenDashboard,
}: DashboardEditorProps) {
  const initial = useMemo(
    () => parseDashboard(yamlContent) ?? createEmptyDashboard(),
    [yamlContent],
  );
  const [data, setData] = useState<DashboardData>(initial);

  const dashboards = useMemo(
    () => plugin.app.vault.getFiles()
      .filter((file) => file.extension === "dashboard")
      .sort((a, b) => a.path.localeCompare(b.path)),
    [plugin.app],
  );

  const duplicateDashboardBasenames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of dashboards) counts.set(file.basename, (counts.get(file.basename) ?? 0) + 1);
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([basename]) => basename));
  }, [dashboards]);

  // External content change (new file content from Obsidian) resets state.
  useEffect(() => {
    setData(initial);
  }, [initial]);

  const handleChange = (next: DashboardData) => {
    setData(next);
    onYamlChange(serializeDashboard(next));
  };

  const showDashboardMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const menu = new Menu();

    if (dashboards.length === 0) {
      menu.addItem((item) => {
        item.setTitle(t("dashboard.noFiles"));
        item.setDisabled(true);
      });
    }

    for (const file of dashboards) {
      menu.addItem((item) => {
        item.setTitle(getDashboardLabel(file, duplicateDashboardBasenames));
        if (file.path === sourcePath) item.setIcon("check");
        item.onClick(() => {
          if (file.path !== sourcePath) void onOpenDashboard(file);
        });
      });
    }

    menu.showAtMouseEvent(event.nativeEvent);
  };

  return (
    <DashboardCanvas
      data={data}
      onChange={handleChange}
      app={plugin.app}
      plugin={plugin}
      sourcePath={sourcePath}
      toolbarLeft={(
        <button
          type="button"
          className="llm-hub-db-title-btn"
          onClick={showDashboardMenu}
          title={t("dashboard.switchDashboard")}
        >
          <span className="llm-hub-db-title">{fileName}</span>
          <ChevronDown size={14} />
        </button>
      )}
    />
  );
}
