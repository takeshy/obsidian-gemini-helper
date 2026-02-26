// Langfuse tracing handler implementation
// Registers as a TracingHandler — core code never imports this file directly.
// In non-langfuse builds, this file is replaced by langfuse-noop.ts via esbuild plugin.

import { Langfuse } from "langfuse";
import type { LangfuseSettings } from "src/types";
import { setTracingHandler, type TracingHandler, type TracingUsage } from "src/core/tracingHooks";

class LangfuseTracingHandler implements TracingHandler {
  private langfuse: Langfuse;
  private settings: LangfuseSettings;
  // Map observation IDs to their parent trace IDs for end calls
  private observationTraceMap = new Map<string, string>();

  constructor(langfuse: Langfuse, settings: LangfuseSettings) {
    this.langfuse = langfuse;
    this.settings = settings;
  }

  private redactInput(input: unknown): unknown {
    return this.settings.logPrompts ? input : "[redacted]";
  }

  private redactOutput(output: unknown): unknown {
    return this.settings.logResponses ? output : "[redacted]";
  }

  traceStart(name: string, params: { sessionId?: string; input?: unknown; metadata?: Record<string, unknown> }): string {
    const trace = this.langfuse.trace({
      name,
      sessionId: params.sessionId,
      metadata: params.metadata,
      input: this.redactInput(params.input),
    });
    return trace.id;
  }

  traceEnd(id: string, params: { output?: unknown; metadata?: Record<string, unknown> }): void {
    this.langfuse.trace({
      id,
      output: this.redactOutput(params.output),
      metadata: params.metadata,
    });
  }

  generationStart(traceId: string, name: string, params: { model?: string; input?: unknown; metadata?: Record<string, unknown> }): string {
    const generation = this.langfuse.generation({
      traceId,
      name,
      model: params.model,
      input: this.redactInput(params.input),
      metadata: params.metadata,
    });
    this.observationTraceMap.set(generation.id, traceId);
    return generation.id;
  }

  generationEnd(id: string, params: { output?: unknown; error?: string; usage?: TracingUsage; metadata?: Record<string, unknown> }): void {
    const traceId = this.observationTraceMap.get(id);
    this.langfuse.generation({
      id,
      traceId,
      endTime: new Date(),
      output: this.redactOutput(params.output),
      level: params.error ? "ERROR" : undefined,
      statusMessage: params.error,
      usage: params.usage ? {
        input: params.usage.input,
        output: params.usage.output,
        total: params.usage.total,
        inputCost: params.usage.inputCost,
        outputCost: params.usage.outputCost,
        totalCost: params.usage.totalCost,
      } : undefined,
      metadata: {
        ...params.metadata,
        ...(params.usage?.thinking !== undefined ? { thinkingTokens: params.usage.thinking } : {}),
      },
    });
    this.observationTraceMap.delete(id);
  }

  spanStart(traceId: string, name: string, params: { parentId?: string; input?: unknown; metadata?: Record<string, unknown> }): string {
    const span = this.langfuse.span({
      traceId,
      name,
      input: this.redactInput(params.input),
      metadata: params.metadata,
      parentObservationId: params.parentId,
    });
    this.observationTraceMap.set(span.id, traceId);
    return span.id;
  }

  spanEnd(id: string, params: { output?: unknown; error?: string; metadata?: Record<string, unknown> }): void {
    const traceId = this.observationTraceMap.get(id);
    this.langfuse.span({
      id,
      traceId,
      endTime: new Date(),
      output: this.redactOutput(params.output),
      level: params.error ? "ERROR" : undefined,
      statusMessage: params.error,
      metadata: params.metadata,
    });
    this.observationTraceMap.delete(id);
  }

  score(traceId: string, params: { name: string; value: number; comment?: string }): void {
    this.langfuse.score({
      traceId,
      name: params.name,
      value: params.value,
      comment: params.comment,
    });
  }

  cleanup(): void {
    this.observationTraceMap.clear();
  }
}

// --- Singleton management ---

let langfuseInstance: Langfuse | null = null;
let tracingHandler: LangfuseTracingHandler | null = null;

export function isLangfuseAvailable(): boolean {
  return true;
}

export function initLangfuse(settings: LangfuseSettings): void {
  if (!settings.publicKey || !settings.secretKey) {
    resetLangfuse();
    return;
  }

  try {
    langfuseInstance = new Langfuse({
      publicKey: settings.publicKey,
      secretKey: settings.secretKey,
      baseUrl: settings.baseUrl || "https://cloud.langfuse.com",
    });
    tracingHandler = new LangfuseTracingHandler(langfuseInstance, settings);
    setTracingHandler(tracingHandler);
  } catch (error) {
    console.error("Failed to initialize Langfuse:", error);
    resetLangfuse();
  }
}

export function resetLangfuse(): void {
  if (langfuseInstance) {
    try {
      langfuseInstance.shutdownAsync().catch(() => {});
    } catch {
      // Best-effort flush on shutdown
    }
  }
  if (tracingHandler) {
    tracingHandler.cleanup();
  }
  setTracingHandler(null);
  langfuseInstance = null;
  tracingHandler = null;
}

export async function sendTestTrace(settings: LangfuseSettings): Promise<void> {
  const testClient = new Langfuse({
    publicKey: settings.publicKey,
    secretKey: settings.secretKey,
    baseUrl: settings.baseUrl || "https://cloud.langfuse.com",
  });

  const errors: unknown[] = [];
  const removeListener = testClient.on("error", (error: unknown) => {
    errors.push(error);
  });

  try {
    testClient.trace({
      name: "connection-test",
      metadata: { source: "obsidian-gemini-helper", test: true },
    });
    await testClient.flushAsync();

    // Wait briefly for async error events to propagate
    await new Promise(resolve => setTimeout(resolve, 500));

    if (errors.length > 0) {
      const msg = errors.map(e => e instanceof Error ? e.message : String(e)).join("; ");
      throw new Error(msg);
    }
  } finally {
    removeListener();
    await testClient.shutdownAsync().catch(() => {});
  }
}
