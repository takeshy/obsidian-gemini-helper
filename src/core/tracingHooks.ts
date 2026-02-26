// Generic tracing hook system
// No dependency on any specific tracing library.
// Core code emits events via `tracing.*` — when no handler is registered, all calls are no-ops.

export interface TracingUsage {
  input?: number;
  output?: number;
  total?: number;
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
}

export interface TracingHandler {
  traceStart(name: string, params: { sessionId?: string; input?: unknown; metadata?: Record<string, unknown> }): string;
  traceEnd(id: string, params: { output?: unknown; metadata?: Record<string, unknown> }): void;
  generationStart(traceId: string, name: string, params: { model?: string; input?: unknown; metadata?: Record<string, unknown> }): string;
  generationEnd(id: string, params: { output?: unknown; error?: string; usage?: TracingUsage; metadata?: Record<string, unknown> }): void;
  spanStart(traceId: string, name: string, params: { parentId?: string; input?: unknown; metadata?: Record<string, unknown> }): string;
  spanEnd(id: string, params: { output?: unknown; error?: string; metadata?: Record<string, unknown> }): void;
  score(traceId: string, params: { name: string; value: number; comment?: string }): void;
}

let handler: TracingHandler | null = null;

export function setTracingHandler(h: TracingHandler | null): void {
  handler = h;
}

export const tracing = {
  traceStart(name: string, params: { sessionId?: string; input?: unknown; metadata?: Record<string, unknown> } = {}): string | null {
    return handler?.traceStart(name, params) ?? null;
  },
  traceEnd(id: string | null, params: { output?: unknown; metadata?: Record<string, unknown> } = {}): void {
    if (id) handler?.traceEnd(id, params);
  },
  generationStart(traceId: string | null, name: string, params: { model?: string; input?: unknown; metadata?: Record<string, unknown> } = {}): string | null {
    if (!traceId) return null;
    return handler?.generationStart(traceId, name, params) ?? null;
  },
  generationEnd(id: string | null, params: { output?: unknown; error?: string; usage?: TracingUsage; metadata?: Record<string, unknown> } = {}): void {
    if (id) handler?.generationEnd(id, params);
  },
  spanStart(traceId: string | null, name: string, params: { parentId?: string; input?: unknown; metadata?: Record<string, unknown> } = {}): string | null {
    if (!traceId) return null;
    return handler?.spanStart(traceId, name, params) ?? null;
  },
  spanEnd(id: string | null, params: { output?: unknown; error?: string; metadata?: Record<string, unknown> } = {}): void {
    if (id) handler?.spanEnd(id, params);
  },
  score(traceId: string | null, params: { name: string; value: number; comment?: string }): void {
    if (traceId) handler?.score(traceId, params);
  },
};
