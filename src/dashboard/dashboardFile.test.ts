import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  TFolder: class TFolder {
    path = "";
    name = "";
  },
  parseYaml: (value: string) => JSON.parse(value) as unknown,
  stringifyYaml: (value: unknown) => JSON.stringify(value),
}));

import { TFolder, type Vault } from "obsidian";
import { ensureVaultFolder, migrateDashboardKanbanWidgetsToFiles, migrateDashboardWidgets } from "./dashboardFile";

function folder(path: string): TFolder {
  const f = new TFolder();
  f.path = path;
  f.name = path.split("/").pop() ?? path;
  return f;
}

function makeVault(options?: {
  folders?: string[];
  files?: string[];
  staleAbstractFolders?: string[];
  staleAfterCreate?: string[];
}) {
  const folders = new Set(options?.folders ?? []);
  const files = new Set(options?.files ?? []);
  const fileContents = new Map<string, string>();
  const staleAbstractFolders = new Set(options?.staleAbstractFolders ?? []);
  const staleAfterCreate = new Set(options?.staleAfterCreate ?? []);
  const created: string[] = [];
  const createdFiles: Array<{ path: string; content: string }> = [];

  const vault = {
    adapter: {
      exists: async (path: string) => folders.has(path) || files.has(path),
      stat: async (path: string) => {
        if (folders.has(path)) return { type: "folder" as const, ctime: 0, mtime: 0, size: 0 };
        if (files.has(path)) return { type: "file" as const, ctime: 0, mtime: 0, size: 0 };
        return null;
      },
    },
    getAbstractFileByPath: (path: string) => {
      if (folders.has(path) && !staleAbstractFolders.has(path)) return folder(path);
      if (files.has(path)) return { path };
      return null;
    },
    create: async (path: string, content: string) => {
      if (folders.has(path) || files.has(path)) throw new Error(`already exists: ${path}`);
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (parent && !folders.has(parent)) throw new Error(`missing parent: ${parent}`);
      files.add(path);
      fileContents.set(path, content);
      createdFiles.push({ path, content });
    },
    createFolder: async (path: string) => {
      if (folders.has(path) || files.has(path)) throw new Error(`already exists: ${path}`);
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (parent && !folders.has(parent)) throw new Error(`missing parent: ${parent}`);
      folders.add(path);
      if (staleAfterCreate.has(path)) staleAbstractFolders.add(path);
      created.push(path);
    },
  } as unknown as Vault;

  return { vault, folders, files, fileContents, created, createdFiles };
}

describe("ensureVaultFolder", () => {
  it("creates nested folders one segment at a time", async () => {
    const { vault, folders, created } = makeVault();

    await ensureVaultFolder(vault, "Dashboards/Data");

    expect([...folders]).toEqual(["Dashboards", "Dashboards/Data"]);
    expect(created).toEqual(["Dashboards", "Dashboards/Data"]);
  });

  it("accepts folders that exist in the adapter before the abstract cache updates", async () => {
    const { vault, created } = makeVault({
      folders: ["Dashboards", "Dashboards/Data"],
      staleAbstractFolders: ["Dashboards/Data"],
    });

    await expect(ensureVaultFolder(vault, "Dashboards/Data")).resolves.toBeUndefined();
    expect(created).toEqual([]);
  });

  it("accepts folders created successfully before the abstract cache updates", async () => {
    const { vault, created } = makeVault({
      folders: ["Dashboards"],
      staleAfterCreate: ["Dashboards/Data"],
    });

    await expect(ensureVaultFolder(vault, "Dashboards/Data")).resolves.toBeUndefined();
    expect(created).toEqual(["Dashboards/Data"]);
  });
});

describe("dashboard widget migrations", () => {
  it("migrates legacy markdown widgets to file widgets", () => {
    const widgets = migrateDashboardWidgets([{
      id: "readme",
      type: "markdown",
      layout: { lg: { x: 0, y: 0, w: 6, h: 4 } },
      config: { path: "Home.md" },
    }]);

    expect(widgets[0].type).toBe("file");
    expect(widgets[0].config).toEqual({ path: "Home.md" });
  });

  it("moves inline kanban widget settings to Dashboards/Kanbans", async () => {
    const { vault, createdFiles } = makeVault();
    const migrated = await migrateDashboardKanbanWidgetsToFiles(vault, {
      version: 1,
      grid: { cols: 12, rowHeight: 80, gap: 8 },
      widgets: [{
        id: "tasks",
        type: "kanban",
        layout: { lg: { x: 0, y: 0, w: 12, h: 6 } },
        config: {
          title: "Tasks",
          statusProperty: "status",
          cardOrder: ["Tasks/A.md"],
          columns: [{ value: "todo", label: "Todo" }],
        },
      }],
    });

    expect(createdFiles).toEqual([{
      path: "Dashboards/Kanbans/Tasks.kanban",
      content: JSON.stringify({
        title: "Tasks",
        statusProperty: "status",
        columns: [{ value: "todo", label: "Todo" }],
      }),
    }]);
    expect(migrated?.widgets[0].config).toEqual({
      kanban: "Dashboards/Kanbans/Tasks.kanban",
      cardOrder: ["Tasks/A.md"],
    });
  });
});
