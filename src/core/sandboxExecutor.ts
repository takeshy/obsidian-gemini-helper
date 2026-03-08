/**
 * Execute JavaScript code in a sandboxed iframe.
 *
 * Security:
 * - iframe `sandbox="allow-scripts"` (no `allow-same-origin`) → opaque origin,
 *   no parent DOM / cookies / localStorage / IndexedDB access.
 * - CSP `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'` →
 *   blocks fetch, XMLHttpRequest, WebSocket, image/font loading, etc.
 *
 * Communication is done via postMessage.
 */

import type { ToolDefinition } from "src/types";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Tool definition for Gemini Function Calling */
export const EXECUTE_JAVASCRIPT_TOOL: ToolDefinition = {
  name: "execute_javascript",
  description:
    "Execute JavaScript code in a sandboxed environment and return the result. " +
    "Useful for string manipulation, data transformation, calculations, " +
    "encoding/decoding, compression, and other programmatic operations. " +
    "The code runs in an isolated sandbox with no DOM, network, or storage access. " +
    "Use `return` to return a value. If `input` is provided, it is available as the `input` variable.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "JavaScript code to execute. Use `return` to return a value. " +
          "The variable `input` contains the input data if provided.",
      },
      input: {
        type: "string",
        description: "Optional input data available as the `input` variable in the code.",
      },
    },
    required: ["code"],
  },
};

const SANDBOX_HTML = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval';"><script>
window.addEventListener('message', async function(event) {
  try {
    var code = event.data.code;
    var input = event.data.input;
    var fn = new Function('input', code);
    var result = fn(input);
    if (result && typeof result.then === 'function') {
      result = await result;
    }
    if (result === undefined || result === null) {
      result = '';
    } else if (typeof result !== 'string') {
      result = JSON.stringify(result);
    }
    parent.postMessage({ type: 'result', value: result }, '*');
  } catch (e) {
    parent.postMessage({ type: 'error', message: e.message || String(e) }, '*');
  }
});
parent.postMessage({ type: 'ready' }, '*');
</` + `script></head><body></body></html>`;

/** Tool executor helper for execute_javascript function calls. */
export async function handleExecuteJavascriptTool(
  args: Record<string, unknown>,
): Promise<{ result: string } | { error: string }> {
  try {
    const code = args.code as string;
    const input = args.input as string | undefined;
    const result = await executeSandboxedJS(code, input);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "JavaScript execution failed" };
  }
}

export function executeSandboxedJS(
  code: string,
  input?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.setCssStyles({ display: "none" });

    let settled = false;

    const cleanup = (timer: ReturnType<typeof setTimeout>) => {
      clearTimeout(timer);
      window.removeEventListener("message", handler);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    const handler = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "ready" && !settled) {
        iframe.contentWindow!.postMessage({ code, input }, "*");
        return;
      }

      if (data.type === "result" && !settled) {
        settled = true;
        cleanup(timer);
        resolve(typeof data.value === "string" ? data.value : String(data.value ?? ""));
        return;
      }

      if (data.type === "error" && !settled) {
        settled = true;
        cleanup(timer);
        reject(new Error(data.message || "Script execution error"));
      }
    };

    window.addEventListener("message", handler);

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup(timer);
        reject(new Error("Script execution timed out"));
      }
    }, timeoutMs);

    iframe.srcdoc = SANDBOX_HTML;
    document.body.appendChild(iframe);
  });
}
