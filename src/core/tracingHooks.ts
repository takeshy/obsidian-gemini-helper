// The tracing hook system lives in the shared library, so shared code can emit events
// without depending on any tracing library.
export {
  tracing,
  setTracingHandler,
  type TracingHandler,
  type TracingUsage,
} from "obsidian-llm-hub-common/core";
