import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { RefreshCw, XCircle, CheckCircle, AlertCircle, Sparkles, Pencil } from "lucide-react";
import { Notice, TFile } from "obsidian";
import { t } from "src/i18n";
import { WORKFLOWS_FOLDER } from "src/types";
import { promptForAIWorkflow } from "src/ui/components/workflow/AIWorkflowModal";
import { saveToCodeBlock } from "src/workflow/codeblockSync";
import { findWorkflowBlocks } from "src/workflow/parser";
import type { ConfigEditorProps } from "../../types";
import { FilePicker } from "./FilePicker";
import { runWorkflowText, saveWidgetCache, resolveWorkflowFile } from "../workflowRunner";

/**
 * Output-format contract appended to the AI workflow-generation prompt so the
 * generated workflow produces a single Markdown/HTML string (not rows), and runs
 * unattended (no interactive nodes). Mirrors gemihub's buildFormatGuidance.
 */
function buildFormatGuidance(output: "markdown" | "html", outputVariable: string): string {
  const kind = output === "html" ? "HTML" : "Markdown";
  return [
    "RUNS UNATTENDED: This workflow executes headlessly in a dashboard widget (no " +
      "user present), so it MUST NOT use any interactive node (no prompt-value, " +
      "prompt-file, prompt-selection, or dialog). Source every input from note/file " +
      "nodes, variable defaults, or fixed values.",
    `OUTPUT CONTRACT: The workflow MUST produce a single ${kind} string and store it ` +
      `in the \`${outputVariable}\` variable (e.g. a script node whose return value is ` +
      `that string, or saveTo: ${outputVariable}). Do NOT return a JSON array.`,
  ].join("\n");
}

interface WorkflowConfig {
  workflow?: string;
  outputVariable?: string;
  output?: "markdown" | "html";
  refreshInterval?: number;
}

type TestResult = { status: "ok"; text: string } | { status: "error"; error: string };

const OUTPUTS: Array<{ value: "markdown" | "html"; labelKey: "dashboard.outputMarkdown" | "dashboard.outputHtml" }> = [
  { value: "markdown", labelKey: "dashboard.outputMarkdown" },
  { value: "html", labelKey: "dashboard.outputHtml" },
];

/**
 * Workflow widget config: pick an existing workflow, choose Markdown or HTML
 * output, and test-run it (persisting the result to the dashboard's sidecar
 * cache so the widget shows output immediately).
 */
export function WorkflowConfigEditor({ config, onChange, app, plugin, widgetId, sourcePath }: ConfigEditorProps) {
  const cfg = (config ?? {}) as WorkflowConfig;
  const output = cfg.output ?? "markdown";

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const workflowFiles = useMemo(
    () =>
      app.vault
        .getMarkdownFiles()
        .map((f) => f.path)
        .filter((p) => p.startsWith(`${WORKFLOWS_FOLDER}/`))
        .sort((a, b) => a.localeCompare(b)),
    [app],
  );

  const update = (patch: Partial<WorkflowConfig>) => onChange({ ...cfg, ...patch });

  useEffect(() => () => abortRef.current?.abort(), []);

  // Run a workflow and persist its result to the widget's sidecar cache. Saving
  // the cache notifies the mounted widget to reload its output.
  const runAndCache = useCallback(
    async (workflowPath: string, outVar: string | undefined) => {
      setTesting(true);
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      try {
        const text = await runWorkflowText(plugin, workflowPath, outVar, abort.signal);
        if (abort.signal.aborted) return;
        if (widgetId && sourcePath) {
          await saveWidgetCache(app, sourcePath, widgetId, { ranAt: Date.now(), status: "ok", text });
        }
        setResult({ status: "ok", text });
      } catch (err) {
        if (abort.signal.aborted) return;
        setResult({ status: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (abortRef.current === abort) {
          abortRef.current = null;
          setTesting(false);
        }
      }
    },
    [plugin, app, widgetId, sourcePath],
  );

  const handleTestRun = useCallback(async () => {
    if (testing || !cfg.workflow) return;
    await runAndCache(cfg.workflow, cfg.outputVariable);
  }, [testing, cfg.workflow, cfg.outputVariable, runAndCache]);

  const outputVariable = cfg.outputVariable || "result";
  const appendInstructions = useMemo(
    () => buildFormatGuidance(output, outputVariable),
    [output, outputVariable],
  );

  const openAI = useCallback(async () => {
    const existing = cfg.workflow ? resolveWorkflowFile(app, cfg.workflow) : null;
    if (existing) {
      // Modify the selected workflow. Locate the block with the canonical
      // parser (anchored, fence-count aware) rather than an ad-hoc regex, then
      // strip the fences — avoids grabbing the wrong/truncated block in notes
      // with multiple or 4-backtick code fences.
      const content = await app.vault.read(existing);
      const blocks = findWorkflowBlocks(content);
      const block = blocks.find((b) => !b.parseError) ?? blocks[0];
      const currentYaml = block
        ? block.raw.replace(/^`{3,}[^\n]*\r?\n/, "").replace(/\r?\n`{3,}\s*$/, "")
        : "";
      const result = await promptForAIWorkflow(app, plugin, "modify", currentYaml, existing.basename, undefined, {
        appendInstructions,
      });
      if (result) {
        await saveToCodeBlock(app, existing, { name: result.name, nodes: result.nodes });
        new Notice(t("dashboard.workflowSaved"));
        update({ workflow: existing.path });
        // Run the just-modified workflow so the widget reflects it immediately.
        await runAndCache(existing.path, cfg.outputVariable);
      }
      return;
    }

    // Create a new workflow.
    const result = await promptForAIWorkflow(app, plugin, "create", undefined, undefined, undefined, {
      appendInstructions,
    });
    if (!result || !result.outputPath) return;
    const path = result.outputPath.endsWith(".md") ? result.outputPath : `${result.outputPath}.md`;
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (folder && !app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder).catch(() => {});
    }
    const existingAbstract = app.vault.getAbstractFileByPath(path);
    let target: TFile;
    if (existingAbstract instanceof TFile) {
      if (findWorkflowBlocks(await app.vault.read(existingAbstract)).length > 0) {
        new Notice(t("dashboard.workflowExists"));
        return;
      }
      target = existingAbstract;
    } else {
      target = await app.vault.create(path, "");
    }
    await saveToCodeBlock(app, target, { name: result.name, nodes: result.nodes });
    new Notice(t("dashboard.workflowSaved"));
    update({ workflow: target.path, outputVariable });
    // Run the freshly-created workflow so the widget shows output immediately.
    await runAndCache(target.path, outputVariable);
  }, [cfg.workflow, app, plugin, appendInstructions, outputVariable, runAndCache]);

  return (
    <div className="llm-hub-db-fields">
      <div className="llm-hub-db-field">
        <label>{t("dashboard.outputFormat")}</label>
        <div className="llm-hub-db-toggle">
          {OUTPUTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`llm-hub-db-toggle-btn${output === o.value ? " is-active" : ""}`}
              onClick={() => update({ output: o.value })}
            >
              {t(o.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.sourceWorkflow")}</label>
        <FilePicker
          value={cfg.workflow ?? ""}
          onChange={(path) => update({ workflow: path })}
          paths={workflowFiles}
          placeholder={t("dashboard.selectWorkflow")}
          searchPlaceholder={t("dashboard.searchPlaceholder")}
        />
        <div className="llm-hub-db-ai-actions">
          <button type="button" className="llm-hub-db-ai-btn" onClick={() => void openAI()}>
            {cfg.workflow ? <Pencil size={13} /> : <Sparkles size={13} />}
            {cfg.workflow ? t("dashboard.aiWorkflowEdit") : t("dashboard.aiWorkflowCreate")}
          </button>
        </div>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.outputVariable")}</label>
        <input
          type="text"
          value={cfg.outputVariable ?? ""}
          onChange={(e) => update({ outputVariable: e.target.value || undefined })}
          placeholder={t("dashboard.outputVariablePlaceholder")}
        />
        <p className="llm-hub-db-hint">{t("dashboard.outputStringHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <div className="llm-hub-db-ai-actions">
          <button
            type="button"
            className="llm-hub-db-ai-btn"
            onClick={() => void handleTestRun()}
            disabled={testing || !cfg.workflow}
          >
            <RefreshCw size={13} className={testing ? "is-spinning" : ""} />
            {testing ? t("dashboard.executing") : t("dashboard.run")}
          </button>
          {testing && (
            <button
              type="button"
              className="llm-hub-db-ai-btn"
              onClick={() => {
                abortRef.current?.abort();
                abortRef.current = null;
                setTesting(false);
              }}
            >
              <XCircle size={13} />
              {t("dashboard.cancel")}
            </button>
          )}
        </div>
        {result?.status === "ok" && (
          <div className="llm-hub-db-test-ok">
            <CheckCircle size={12} /> {t("dashboard.testRunSuccess")}
            <pre>{result.text.slice(0, 300)}</pre>
          </div>
        )}
        {result?.status === "error" && (
          <div className="llm-hub-db-test-err">
            <AlertCircle size={12} /> {result.error}
          </div>
        )}
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.refreshInterval")}</label>
        <input
          type="number"
          min={0}
          value={cfg.refreshInterval ?? 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            update({ refreshInterval: Number.isFinite(n) && n > 0 ? n : 0 });
          }}
        />
        <p className="llm-hub-db-hint">{t("dashboard.refreshIntervalHint")}</p>
      </div>
    </div>
  );
}
