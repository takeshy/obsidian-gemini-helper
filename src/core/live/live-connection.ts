import { geminiCorsFetch } from "obsidian-llm-hub-common/core";
import type { LiveConnectionConfig, LiveOptions } from "./live-session";
import { geminiLiveSetup } from "./gemini-live-config";

/** Exchange the device-local API key for a single-use, setup-bound token. */
export async function createGeminiLiveToken(options: LiveOptions, connection: LiveConnectionConfig, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  try {
    const response = await geminiCorsFetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": connection.apiKey },
      body: JSON.stringify({
        uses: 1, expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        bidiGenerateContentSetup: geminiLiveSetup(options),
      }), signal,
    });
    signal.throwIfAborted();
    if (!response.ok) throw new Error(`Live HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
    const body = await response.json() as { name?: unknown };
    signal.throwIfAborted();
    if (typeof body.name !== "string" || !/^auth_tokens\/\S{1,8000}$/.test(body.name)) throw new Error("Invalid Gemini Live token");
    return body.name;
  } catch (error) {
    signal.throwIfAborted();
    let message = error instanceof Error ? error.message : "Gemini Live authentication failed";
    if (connection.apiKey) message = message.split(connection.apiKey).join("[redacted]");
    throw new Error(message);
  }
}
