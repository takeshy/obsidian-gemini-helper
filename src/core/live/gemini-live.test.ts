import assert from "node:assert/strict";
import { test, vi, afterEach } from "vitest";
afterEach(() => vi.restoreAllMocks());
import { GeminiLiveSession } from "./gemini-live";
import type { LiveState, LiveTranscript, LiveCallbacks, LiveOptions } from "./live-session";

const { createToken } = vi.hoisted(() => ({ createToken: vi.fn() }));
vi.mock("./live-connection", () => ({ createGeminiLiveToken: createToken }));

const options = { model: "gemini-3.8-live", voice: "Kore", language: "ja" as const, instructions: "Talk naturally" };
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture(t: import("vitest").TestContext, pendingMic?: Promise<unknown>, onToolCall?: LiveCallbacks["onToolCall"], access: Partial<LiveOptions> = {}) {
  const sessionOptions = { ...options, ...access };
  let microphoneStops = 0, outputStops = 0, contextCloses = 0, micRequests = 0;
  const track = { enabled: true, stop() { microphoneStops++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const output = { stream: { getTracks: () => [{ stop() { outputStops++; } }] }, disconnect() {} };
  const audio = { pause() {}, play: async () => {}, srcObject: null, setSinkId: vi.fn().mockResolvedValue(undefined) };
  const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => { micRequests++; return pendingMic || stream; });
  const states: LiveState[] = [], errors: string[] = [];
  let transcript: LiveTranscript[] = [];
  const sources: { buffer?: { duration: number }; startTime?: number; stopped: boolean; connect(): void; disconnect(): void; start(time: number): void; stop(): void; onended: (() => void) | null }[] = [];
  const recorder = { port: { onmessage: null as ((event: { data: ArrayBuffer }) => void) | null, postMessage() {}, close() {} }, connect() {}, disconnect() {} };
  const context = {
    currentTime: 1, destination: {}, audioWorklet: { addModule: async (url: string) => { assert.ok(url.startsWith("blob:")); } },
    resume: async () => {}, close: async () => { contextCloses++; }, createMediaStreamDestination: () => output,
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createBuffer: (_channels: number, size: number, rate: number) => ({ duration: size / rate, getChannelData: () => new Float32Array(size) }),
    createBufferSource: () => { const source = { buffer: undefined as { duration: number } | undefined, stopped: false, startTime: undefined as number | undefined, onended: null as (() => void) | null, connect() {}, disconnect() {}, start(time: number) { this.startTime = time; }, stop() { this.stopped = true; } }; sources.push(source); return source; },
  };
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1; bufferedAmount = 0; closed = false; sent: string[] = [];
    onopen: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(public url: string) { sockets.push(this); }
    send(body: string) { this.sent.push(body); }
    close() { this.closed = true; }
  }
  for (const [name, value] of Object.entries({ window: { AudioContext: function () { return context; }, setTimeout, clearTimeout }, navigator: { mediaDevices: { getUserMedia } }, AudioWorkletNode: function () { return recorder; }, WebSocket: FakeSocket })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.onTestFinished(() => { if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globalThis, name); });
  }
  createToken.mockImplementation(async (received: LiveOptions) => {
    assert.deepEqual(received, sessionOptions);
    return "auth_tokens/synthetic-token";
  });
  const session = new GeminiLiveSession({ audio: audio as unknown as HTMLAudioElement, onToolCall, onState: state => states.push(state), onError: error => errors.push(error), onTranscript: items => { transcript = items; } }, { apiKey: "test-key" });
  t.onTestFinished(() => session.stop());
  const event = async (body: unknown) => { sockets[0].onmessage?.({ data: JSON.stringify(body) }); await tick(); };
  const connect = async () => {
    const starting = session.start(sessionOptions);
    for (let i = 0; i < 20 && !sockets.length; i++) await tick();
    assert.equal(sockets.length, 1); sockets[0].onopen?.();
    assert.equal(states.at(-1), "connecting");
    await event({ setupComplete: {} }); await starting;
  };
  return { session, audio, getUserMedia, states, errors, sockets, sources, recorder, track, context, stream, event, connect,
    get transcript() { return transcript; }, get microphoneStops() { return microphoneStops; }, get outputStops() { return outputStops; }, get contextCloses() { return contextCloses; }, get micRequests() { return micRequests; } };
}

test("Gemini uses the selected microphone and speaker", async t => {
  const f = fixture(t, undefined, undefined, { inputDeviceId: "usb-mic", outputDeviceId: "headphones" });
  await f.connect();
  assert.deepEqual(f.getUserMedia.mock.calls[0][0], { audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, deviceId: { exact: "usb-mic" } }, video: false });
  assert.equal(f.audio.setSinkId.mock.calls[0][0], "headphones");
});

test("Gemini selects the output after microphone permission and releases everything when it fails before requesting credentials", async t => {
  const f = fixture(t);
  createToken.mockClear();
  f.audio.setSinkId.mockImplementation(async () => { assert.equal(f.micRequests, 1); throw new Error("Device missing"); });
  await f.session.start({ ...options, outputDeviceId: "disconnected" });
  assert.equal(f.contextCloses, 1); assert.equal(f.outputStops, 1); assert.equal(f.microphoneStops, 1);
  assert.equal(createToken.mock.calls.length, 0);
  assert.match(f.errors[0], /selected audio output/);
});

test("Gemini explains a disconnected saved microphone even when the browser error is empty", async t => {
  const f = fixture(t, undefined, undefined, { inputDeviceId: "disconnected" });
  f.getUserMedia.mockRejectedValue({ name: "OverconstrainedError", message: "", constraint: "deviceId" });
  await f.session.start({ ...options, inputDeviceId: "disconnected" });
  assert.equal(f.sockets.length, 0);
  assert.match(f.errors[0], /selected microphone is unavailable/);
});

test("Gemini reports a missing selected microphone and releases playback without retrying", async t => {
  const f = fixture(t, undefined, undefined, { inputDeviceId: "disconnected" });
  f.getUserMedia.mockRejectedValue(new Error("Requested microphone is unavailable"));
  await f.session.start({ ...options, inputDeviceId: "disconnected" });
  assert.equal(f.getUserMedia.mock.calls.length, 1);
  assert.equal(f.contextCloses, 1); assert.equal(f.outputStops, 1);
  assert.equal(f.sockets.length, 0);
  assert.equal(f.errors[0], "Requested microphone is unavailable");
});

test("Gemini Live waits for setup, streams PCM with an ephemeral token, mutes and releases all resources", async t => {
  const f = fixture(t); await f.connect();
  assert.equal(f.states.at(-1), "connected");
  const socket = f.sockets[0]; assert.match(socket.url, /v1beta.*BidiGenerateContentConstrained\?access_token=auth_tokens%2Fsynthetic-token$/);
  const setup = JSON.parse(socket.sent[0]).setup;
  assert.equal(setup.model, "models/gemini-3.8-live"); assert.deepEqual(setup.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  assert.ok(setup.inputAudioTranscription && setup.outputAudioTranscription);
  const pcm = new Uint8Array([1, 2, 3, 4]).buffer;
  f.recorder.port.onmessage?.({ data: pcm });
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!).realtimeInput.audio, { data: "AQIDBA==", mimeType: "audio/pcm;rate=16000" });
  f.session.mute(true); assert.equal(f.track.enabled, false);
  assert.equal(JSON.parse(socket.sent.at(-1)!).realtimeInput.audioStreamEnd, true);
  const count = socket.sent.length; f.recorder.port.onmessage?.({ data: pcm }); assert.equal(socket.sent.length, count);
  f.session.mute(false); f.recorder.port.onmessage?.({ data: pcm }); assert.equal(socket.sent.length, count + 1);
  f.session.stop(); assert.equal(f.microphoneStops, 1); assert.equal(f.outputStops, 1); assert.equal(f.contextCloses, 1); assert.equal(socket.closed, true);
});

test("Gemini processes all audio parts, preserves delayed user transcripts, and discards queued audio on interruption", async t => {
  const f = fixture(t); await f.connect();
  await f.event({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAAAA==", mimeType: "audio/pcm;rate=24000" } }, { inlineData: { data: "AAAAAA==", mimeType: "audio/pcm;rate=24000" } }] }, outputTranscription: { text: "こんにちは" }, turnComplete: true } });
  assert.equal(f.sources.length, 2); assert.ok(f.sources[1].startTime! > f.sources[0].startTime!);
  await f.event({ serverContent: { inputTranscription: { text: "やあ", finished: true } } });
  assert.deepEqual(f.transcript.map(({ role, text }) => ({ role, text })), [{ role: "user", text: "やあ" }, { role: "assistant", text: "こんにちは" }]);
  await f.event({ serverContent: { interrupted: true, inputTranscription: { text: "続けて", finished: true }, outputTranscription: { text: "はい" } } });
  assert.ok(f.sources.every(source => source.stopped)); assert.equal(f.transcript.length, 4);
});

test("cancelling pending Gemini microphone permission releases late tracks without creating a socket", async t => {
  const mic = deferred<unknown>(), f = fixture(t, mic.promise);
  const starting = f.session.start(options); for (let i = 0; i < 20 && !f.micRequests; i++) await tick();
  f.session.stop(); mic.resolve(f.stream); await starting;
  assert.equal(f.microphoneStops, 1); assert.equal(f.sockets.length, 0); assert.equal(f.states.at(-1), "idle");
});

test("a delayed final input transcript stays with its earlier partial text after the model turn ends", async t => {
  const f = fixture(t); await f.connect();
  await f.event({ serverContent: { inputTranscription: { text: "こん" } } });
  await f.event({ serverContent: { outputTranscription: { text: "やあ" }, turnComplete: true } });
  await f.event({ serverContent: { inputTranscription: { text: "にちは", finished: true } } });
  assert.deepEqual(f.transcript.map(({ role, text }) => ({ role, text })), [{ role: "user", text: "こんにちは" }, { role: "assistant", text: "やあ" }]);
});

test("Gemini separates successive exchanges when neither transcription sends a finished flag", async t => {
  const f = fixture(t); await f.connect();
  for (const [question, answer] of [["こんにちは", "こんにちは。"], ["明日の天気は？", "場所を教えてください。"], ["東京です", "東京ですね。"]]) {
    await f.event({ serverContent: { inputTranscription: { text: question.slice(0, 2) } } });
    await f.event({ serverContent: { inputTranscription: { text: question.slice(2) } } });
    await f.event({ serverContent: { outputTranscription: { text: answer.slice(0, 2) } } });
    await f.event({ serverContent: { outputTranscription: { text: answer.slice(2) } } });
    await f.event({ serverContent: { turnComplete: true } });
  }
  assert.deepEqual(f.transcript.map(({ role, text }) => ({ role, text })), [
    { role: "user", text: "こんにちは" }, { role: "assistant", text: "こんにちは。" },
    { role: "user", text: "明日の天気は？" }, { role: "assistant", text: "場所を教えてください。" },
    { role: "user", text: "東京です" }, { role: "assistant", text: "東京ですね。" },
  ]);
  assert.equal(new Set(f.transcript.map(item => item.id)).size, 6);
});

test("explicit input completion and model completion do not advance the user twice", async t => {
  const f = fixture(t); await f.connect();
  await f.event({ serverContent: { inputTranscription: { text: "一問目", finished: true } } });
  await f.event({ serverContent: { outputTranscription: { text: "一答目" }, turnComplete: true } });
  await f.event({ serverContent: { inputTranscription: { text: "二問目" } } });
  await f.event({ serverContent: { inputTranscription: { finished: true } } });
  await f.event({ serverContent: { outputTranscription: { text: "二答目" }, turnComplete: true } });
  await f.event({ serverContent: { inputTranscription: { text: "三問目" } } });
  await f.event({ serverContent: { outputTranscription: { text: "三答目" }, turnComplete: true } });
  assert.deepEqual(f.transcript.map(item => item.text), ["一問目", "一答目", "二問目", "二答目", "三問目", "三答目"]);
});

test("multiple finalized user utterances before a response retain their spoken order", async t => {
  const f = fixture(t); await f.connect();
  await f.event({ serverContent: { inputTranscription: { text: "質問です", finished: true } } });
  await f.event({ serverContent: { inputTranscription: { text: "補足です", finished: true } } });
  await f.event({ serverContent: { outputTranscription: { text: "承知しました" }, turnComplete: true } });
  assert.deepEqual(f.transcript.map(item => item.text), ["質問です", "補足です", "承知しました"]);
});

test("interrupting an unfinished Gemini response opens a new user bubble without finished flags", async t => {
  const f = fixture(t); await f.connect();
  await f.event({ serverContent: { inputTranscription: { text: "説明して" } } });
  await f.event({ serverContent: { outputTranscription: { text: "まずは" } } });
  await f.event({ serverContent: { interrupted: true, inputTranscription: { text: "やっぱり" } } });
  await f.event({ serverContent: { turnComplete: true } });
  await f.event({ serverContent: { inputTranscription: { text: "短く教えて" } } });
  await f.event({ serverContent: { outputTranscription: { text: "要点は" }, turnComplete: true } });
  await f.event({ serverContent: { inputTranscription: { text: "ありがとう" } } });
  assert.deepEqual(f.transcript.map(item => item.text), ["説明して", "まずは", "やっぱり短く教えて", "要点は", "ありがとう"]);
});

test("Extended Thinking filler turns keep one user bubble and chronological assistant responses", async t => {
  const f = fixture(t); await f.connect();
  await f.event({ serverContent: { inputTranscription: { text: "調べて" } } });
  await f.event({ serverContent: { outputTranscription: { text: "確認します" }, turnComplete: true, interactionStatus: "IN_PROGRESS" } });
  await f.event({ serverContent: { inputTranscription: { text: "ください" } } });
  await f.event({ serverContent: { outputTranscription: { text: "結果です" }, turnComplete: true, interactionStatus: "FINISHED" } });
  await f.event({ serverContent: { inputTranscription: { text: "次の質問" } } });
  await f.event({ serverContent: { outputTranscription: { text: "どうぞ" }, turnComplete: true } });
  assert.deepEqual(f.transcript.map(item => item.text), ["調べてください", "確認します", "結果です", "次の質問", "どうぞ"]);
});

test("cancelling Gemini setup closes the negotiating socket and ignores late messages", async t => {
  const f = fixture(t), starting = f.session.start(options);
  for (let i = 0; i < 20 && !f.sockets.length; i++) await tick();
  const late = f.sockets[0].onmessage;
  f.session.stop(); await starting;
  await late?.({ data: JSON.stringify({ setupComplete: {} }) }); await tick();
  assert.equal(f.sockets[0].closed, true); assert.ok(!f.states.includes("connected")); assert.equal(f.microphoneStops, 1);
});

test("locked Gemini keys release the microphone and playback without opening a socket", async t => {
  const f = fixture(t);
  createToken.mockRejectedValue(new Error("Unlock Gemini"));
  await f.session.start(options);
  assert.equal(f.errors.at(-1), "Unlock Gemini");
  assert.equal(f.micRequests, 1);
  assert.equal(f.microphoneStops, 1);
  assert.equal(f.outputStops, 1);
  assert.equal(f.contextCloses, 1);
  assert.equal(f.sockets.length, 0);
  assert.equal(f.states.at(-1), "idle");
});

test("excessive Gemini send buffering stops the microphone", async t => {
  const f = fixture(t); await f.connect();
  f.sockets[0].bufferedAmount = 1_000_001;
  f.recorder.port.onmessage?.({ data: new ArrayBuffer(1280) });
  assert.match(f.errors.at(-1)!, /too slow/); assert.equal(f.microphoneStops, 1);

});

test("Gemini transport errors stop the microphone and close the connection", async t => {
  const f = fixture(t); await f.connect(); f.sockets[0].onerror?.();
  assert.match(f.errors.at(-1)!, /connection failed/); assert.equal(f.microphoneStops, 1); assert.equal(f.sockets[0].closed, true);
});

test("Gemini worklet load failure releases the microphone and creates no socket", async t => {
  const f = fixture(t); vi.spyOn(f.context.audioWorklet, "addModule").mockRejectedValue(new Error("Could not load recorder"));
  await f.session.start(options); assert.equal(f.errors.at(-1), "Could not load recorder"); assert.equal(f.microphoneStops, 1); assert.equal(f.sockets.length, 0);
});

test("Gemini Live returns file tool results and keeps receiving audio during the read", async t => {
  const result = deferred<unknown>(); let executions = 0;
  const f = fixture(t, undefined, async call => { executions++; assert.equal(call.name, "read_current_file"); return result.promise; }, { fileAccess: true });
  await f.connect(); const sentBefore = f.sockets[0].sent.length;
  const tool = { toolCall: { functionCalls: [{ id: "file-1", name: "read_current_file", args: {} }] } };
  await f.event(tool); await f.event(tool);
  await f.event({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAAAAA==" } }] } } });
  assert.equal(f.sources.length, 1); assert.equal(executions, 1); assert.equal(f.sockets[0].sent.length, sentBefore);
  result.resolve({ content: "Friday launch", source: "plan.md" }); await tick();
  assert.deepEqual(JSON.parse(f.sockets[0].sent.at(-1)!), { toolResponse: { functionResponses: [{ id: "file-1", name: "read_current_file", response: { content: "Friday launch", source: "plan.md" } }] } });
});

test("Gemini tool cancellation aborts an in-flight read and never sends a stale result", async t => {
  const result = deferred<unknown>(); let signal: AbortSignal | undefined;
  const f = fixture(t, undefined, async (_call, currentSignal) => { signal = currentSignal; return result.promise; }, { fileAccess: true });
  await f.connect(); const before = f.sockets[0].sent.length;
  await f.event({ toolCall: { functionCalls: [{ id: "read-1", name: "read_current_file", args: {} }] } });
  await f.event({ toolCallCancellation: { ids: ["read-1"] } }); result.resolve({ content: "late text" }); await tick();
  assert.equal(signal?.aborted, true); assert.equal(f.sockets[0].sent.length, before);
});
