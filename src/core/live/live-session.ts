import type { LiveFileAccess, LiveToolCall } from "./live-tool-definitions";

export type LiveState = "idle" | "connecting" | "connected";
export interface LiveTranscript { id: string; role: "user" | "assistant"; text: string }
export interface LiveOptions extends LiveFileAccess { model: string; voice: string; instructions: string; language: "ja" | "en" }
export interface LiveConnectionConfig { apiKey: string }
export interface LiveCallbacks {
  audio: HTMLAudioElement;
  onState: (state: LiveState) => void;
  onTranscript: (transcript: LiveTranscript[]) => void;
  onError: (message: string) => void;
  onToolCall?: (call: LiveToolCall, signal: AbortSignal) => Promise<unknown>;
}
export interface LiveSession { start(options: LiveOptions): Promise<void>; stop(): void; mute(muted: boolean): void }
