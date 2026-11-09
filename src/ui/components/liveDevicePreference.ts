import type { App } from "obsidian";

export type LiveDeviceKind = "input" | "output";

const LIVE_DEVICE_KEYS: Record<LiveDeviceKind, string> = {
  input: "gemini-helper-live-input-device",
  output: "gemini-helper-live-output-device",
};

/** Selected audio device per vault; an empty string means the system default. */
export function getLiveDevicePreference(app: App, kind: LiveDeviceKind): string {
  const saved: unknown = app.loadLocalStorage(LIVE_DEVICE_KEYS[kind]);
  return typeof saved === "string" ? saved : "";
}

export function setLiveDevicePreference(app: App, kind: LiveDeviceKind, deviceId: string): void {
  app.saveLocalStorage(LIVE_DEVICE_KEYS[kind], deviceId);
}
