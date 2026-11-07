import assert from "node:assert/strict";
import { test } from "vitest";
import { runInNewContext } from "node:vm";
import { GEMINI_LIVE_RECORDER_SOURCE as worklet } from "./gemini-recorder";

test("microphone worklet resamples 48 kHz and 44.1 kHz across render quanta into 16 kHz PCM16 frames", () => {
  for (const rate of [48000, 44100, 16000]) {
    const frames: ArrayBuffer[] = [];
    let Recorder: new () => { process(inputs: Float32Array[][]): boolean; port: { onmessage(): void } };
    runInNewContext(worklet, { sampleRate: rate, AudioWorkletProcessor: class { port = { onmessage: null, postMessage: (frame: ArrayBuffer) => frames.push(frame) }; }, registerProcessor: (name: string, value: typeof Recorder) => { assert.equal(name, "gemini-live-recorder"); Recorder = value; } });
    const recorder = new Recorder!();
    for (let offset = 0; offset < rate; offset += 128) recorder.process([[new Float32Array(Math.min(128, rate - offset)).fill(0.5)]]);
    assert.equal(frames.length, 25); assert.ok(frames.every(frame => frame.byteLength === 1280));
    for (const frame of frames) assert.equal(new DataView(frame).getInt16(0, true), 16384);
    recorder.process([[new Float32Array(64).fill(1)]]); recorder.port.onmessage();
    const before = frames.length;
    for (let offset = 0; offset < rate * 0.04; offset += 1) recorder.process([[new Float32Array(1).fill(-1)]]);
    assert.equal(frames.length, before + 1); assert.equal(new DataView(frames.at(-1)!).getInt16(0, true), -32768);
  }
});
