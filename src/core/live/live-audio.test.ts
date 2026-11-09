import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { listLiveAudioDevices, liveMicrophoneConstraints, openLiveMicrophone, setLiveAudioOutput, supportsLiveAudioOutput } from "./live-audio";

afterEach(() => vi.unstubAllGlobals());

test("default input does not constrain device ID, while a selection is mandatory", () => {
  assert.equal(liveMicrophoneConstraints().deviceId, undefined);
  assert.deepEqual(liveMicrophoneConstraints("usb-mic").deviceId, { exact: "usb-mic" });
});

test("unsupported output selection permits the system default but rejects a specific device", async () => {
  const audio = {} as HTMLAudioElement;
  await setLiveAudioOutput(audio);
  await assert.rejects(setLiveAudioOutput(audio, "speaker"), /unavailable/);
});

function devicesFixture() {
  const stop = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
  const enumerateDevices = vi.fn().mockResolvedValue([
    { kind: "videoinput", deviceId: "camera" }, { kind: "audioinput", deviceId: "" },
    { kind: "audioinput", deviceId: "default" }, { kind: "audioinput", deviceId: "communications" },
    { kind: "audioinput", deviceId: "mic", label: "USB mic" },
    { kind: "audiooutput", deviceId: "communications", label: "Communications - Speaker" },
    { kind: "audiooutput", deviceId: "speaker", label: "Speaker" },
  ]);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia, enumerateDevices } });
  return { stop, getUserMedia, enumerateDevices };
}

test("listing devices skips OS aliases and never requests microphone permission automatically", async () => {
  const f = devicesFixture();
  const devices = await listLiveAudioDevices();
  assert.deepEqual(devices.map(device => device.deviceId), ["mic", "speaker"]);
  assert.equal(f.getUserMedia.mock.calls.length, 0);
});

test("explicit refresh lists devices while permission is active and releases the temporary microphone", async () => {
  const f = devicesFixture();
  f.enumerateDevices.mockImplementation(async () => { assert.equal(f.stop.mock.calls.length, 0); return []; });
  await listLiveAudioDevices(true);
  assert.equal(f.getUserMedia.mock.calls.length, 1);
  assert.equal(f.stop.mock.calls.length, 1);
});

test("failed enumeration still releases temporary microphone tracks", async () => {
  const f = devicesFixture();
  f.enumerateDevices.mockRejectedValue(new Error("Enumeration failed"));
  await assert.rejects(listLiveAudioDevices(true), /Enumeration failed/);
  assert.equal(f.stop.mock.calls.length, 1);
});

test("denied microphone permission is reported without enumeration", async () => {
  const f = devicesFixture();
  f.getUserMedia.mockRejectedValue(new Error("Permission denied"));
  await assert.rejects(listLiveAudioDevices(true), /Permission denied/);
  assert.equal(f.enumerateDevices.mock.calls.length, 0);
});

test("a disconnected exact microphone is explained even when the browser error is empty or not an Error", async () => {
  const f = devicesFixture();
  f.getUserMedia.mockRejectedValue({ name: "OverconstrainedError", message: "", constraint: "deviceId" });
  await assert.rejects(openLiveMicrophone(liveMicrophoneConstraints("gone")), /selected microphone is unavailable/);
  f.getUserMedia.mockRejectedValue(Object.assign(new Error(""), { name: "NotFoundError" }));
  await assert.rejects(openLiveMicrophone(liveMicrophoneConstraints("gone")), /selected microphone is unavailable/);
  f.getUserMedia.mockRejectedValue(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }));
  await assert.rejects(openLiveMicrophone(liveMicrophoneConstraints()), /denied/);
  f.getUserMedia.mockRejectedValue(new Error("Hardware busy"));
  await assert.rejects(openLiveMicrophone(liveMicrophoneConstraints()), /Hardware busy/);
  f.getUserMedia.mockRejectedValue(undefined);
  await assert.rejects(openLiveMicrophone(liveMicrophoneConstraints()), /Could not access the microphone/);
});

test("output support is detected from the element or the media element prototype", () => {
  vi.stubGlobal("HTMLMediaElement", { prototype: { setSinkId() {} } });
  assert.equal(supportsLiveAudioOutput(), true);
  assert.equal(supportsLiveAudioOutput({} as HTMLAudioElement), false);
  vi.stubGlobal("HTMLMediaElement", { prototype: {} });
  assert.equal(supportsLiveAudioOutput(), false);
});
