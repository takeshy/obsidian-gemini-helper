import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { getLiveDevicePreference, setLiveDevicePreference } from "./liveDevicePreference";

function makeApp(initial: Record<string, unknown> = {}) {
  const storedValues = new Map<string, unknown>(Object.entries(initial));
  const app = {
    loadLocalStorage: (key: string) => storedValues.get(key),
    saveLocalStorage: (key: string, value: unknown) => storedValues.set(key, value),
  } as unknown as App;
  return { app, storedValues };
}

describe("live device preference", () => {
  it("defaults missing or malformed values to the system default", () => {
    expect(getLiveDevicePreference(makeApp().app, "input")).toBe("");
    expect(getLiveDevicePreference(makeApp({ "gemini-helper-live-output-device": 42 }).app, "output")).toBe("");
  });

  it("stores input and output selections under separate keys", () => {
    const { app, storedValues } = makeApp({ "gemini-helper-live-input-device": "usb-mic" });
    expect(getLiveDevicePreference(app, "input")).toBe("usb-mic");
    expect(getLiveDevicePreference(app, "output")).toBe("");

    setLiveDevicePreference(app, "output", "headphones");
    expect(storedValues.get("gemini-helper-live-output-device")).toBe("headphones");
    expect(getLiveDevicePreference(app, "input")).toBe("usb-mic");

    setLiveDevicePreference(app, "input", "");
    expect(getLiveDevicePreference(app, "input")).toBe("");
  });
});
