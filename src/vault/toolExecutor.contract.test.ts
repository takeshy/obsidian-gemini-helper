import { describe, expect, it } from "vitest";
import { App, TFile, TFolder } from "obsidian";
import {
  NEVER_ADVERTISED_VAULT_TOOL_NAMES,
  getEnabledVaultTools,
} from "obsidian-llm-hub-common/core";
import { HOST_EXECUTES_RAG_SYNC_STATUS, executeToolCall } from "./toolExecutor";

/**
 * The built-in Vault tools are declared in one place and executed in another.
 * This is what stops the two from drifting: every tool this host advertises has
 * to be answered by something, and the capability flag has to match what the
 * executor can actually do.
 */
function emptyApp(): App {
  return {
    vault: {
      getFiles: (): TFile[] => [],
      getMarkdownFiles: (): TFile[] => [],
      getAllLoadedFiles: (): (TFile | TFolder)[] => [],
      getAbstractFileByPath: () => null,
      read: async () => "",
      cachedRead: async () => "",
    },
    workspace: { getActiveFile: () => null },
  } as unknown as App;
}

async function answers(toolName: string): Promise<boolean> {
  const result = await executeToolCall(emptyApp(), toolName, {});
  return !String(result.error ?? "").startsWith("Unknown tool");
}

describe("vault tool executor contract", () => {
  const advertised = getEnabledVaultTools({
    allowWrite: true,
    allowDelete: true,
    ragSyncStatus: HOST_EXECUTES_RAG_SYNC_STATUS,
  }).map(tool => tool.name);

  it("executes every tool it advertises", async () => {
    const unanswered: string[] = [];
    for (const name of advertised) if (!(await answers(name))) unanswered.push(name);
    expect(unanswered).toEqual([]);
  });

  it("still answers the tools it stopped advertising, so replayed calls resolve", async () => {
    const unanswered: string[] = [];
    for (const name of NEVER_ADVERTISED_VAULT_TOOL_NAMES) if (!(await answers(name))) unanswered.push(name);
    expect(unanswered).toEqual([]);
  });

  it("answers the confirmation steps the chat drives directly", async () => {
    const unanswered: string[] = [];
    for (const name of ["apply_edit", "discard_edit", "apply_delete", "discard_delete"]) {
      if (!(await answers(name))) unanswered.push(name);
    }
    expect(unanswered).toEqual([]);
  });

  it("declares the RAG sync capability it can actually answer", async () => {
    expect(await answers("get_rag_sync_status")).toBe(HOST_EXECUTES_RAG_SYNC_STATUS);
  });

  it("reports a name nothing implements", async () => {
    expect(await answers("make_coffee")).toBe(false);
  });
});
