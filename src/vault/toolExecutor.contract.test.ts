import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  NEVER_ADVERTISED_VAULT_TOOL_NAMES,
  VAULT_TOOL_NAMES,
  getEnabledVaultTools,
} from "obsidian-llm-hub-common/core";
import { HOST_EXECUTES_RAG_SYNC_STATUS } from "./toolExecutor";

/**
 * The built-in Vault tool schemas live in the shared library; the switch below
 * is this host's own. These tests are what stops the two from drifting apart:
 * a tool this host cannot execute must never be advertised, and a case this
 * host answers must correspond to a shared definition rather than a private
 * name the other plugins never learned about.
 */
const CONFIRMATION_STEPS = ["apply_edit", "discard_edit", "apply_delete", "discard_delete"];

const source = readFileSync(fileURLToPath(new URL("./toolExecutor.ts", import.meta.url)), "utf8");
const handled = [...source.matchAll(/^\s+case "([a-z_]+)":/gm)].map(match => match[1]);

describe("vault tool executor contract", () => {
  it("executes every tool it advertises", () => {
    const advertised = getEnabledVaultTools({
      allowWrite: true,
      allowDelete: true,
      ragSyncStatus: HOST_EXECUTES_RAG_SYNC_STATUS,
    }).map(tool => tool.name);
    expect(advertised.filter(name => !handled.includes(name))).toEqual([]);
  });

  it("still answers the tools it stopped advertising, so replayed calls resolve", () => {
    expect(NEVER_ADVERTISED_VAULT_TOOL_NAMES.filter(name => !handled.includes(name))).toEqual([]);
  });

  it("answers no tool the shared definitions never declared", () => {
    expect(handled.filter(name => !VAULT_TOOL_NAMES.includes(name) && !CONFIRMATION_STEPS.includes(name))).toEqual([]);
  });

  it("declares the RAG sync capability the switch actually implements", () => {
    expect(HOST_EXECUTES_RAG_SYNC_STATUS).toBe(handled.includes("get_rag_sync_status"));
  });
});
