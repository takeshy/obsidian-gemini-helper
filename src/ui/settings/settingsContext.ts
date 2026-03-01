import type { GeminiHelperPlugin } from "src/plugin";

export interface SettingsContext {
  plugin: GeminiHelperPlugin;
  display: () => void;
  /** Mutable ref for RAG sync cancellation */
  syncCancelRef: { value: boolean };
}
