import { useEffect, useMemo, useState } from "react";
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
}: DashboardEditorProps) {
  const initial = useMemo(
    () => parseDashboard(yamlContent) ?? createEmptyDashboard(),
    [yamlContent],
  );
  const [data, setData] = useState<DashboardData>(initial);

  // External content change (new file content from Obsidian) resets state.
  useEffect(() => {
    setData(initial);
  }, [initial]);

  const handleChange = (next: DashboardData) => {
    setData(next);
    onYamlChange(serializeDashboard(next));
  };

  return (
    <DashboardCanvas
      data={data}
      onChange={handleChange}
      app={plugin.app}
      plugin={plugin}
      sourcePath={sourcePath}
      toolbarLeft={<span className="llm-hub-db-title">{fileName}</span>}
    />
  );
}
