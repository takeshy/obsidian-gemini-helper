import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiLiveToken } from "./live-connection";
import { geminiLiveSetup } from "./gemini-live-config";
import type { LiveOptions } from "./live-session";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("obsidian-llm-hub-common/core", async original => ({ ...await original<object>(), geminiCorsFetch: request }));
const options: LiveOptions = { model: "gemini-3.8-live", voice: "Kore", language: "ja", instructions: "User preferences", fileAccess: true, ragEnabled: true };
const connection = { apiKey: "private-api-key" };
beforeEach(() => vi.resetAllMocks());

describe("Gemini Live authentication", () => {
  it("locks a single-use token to the exact setup and keeps the permanent key in a header", async () => {
    request.mockResolvedValue(Response.json({ name: "auth_tokens/ephemeral" }));
    expect(await createGeminiLiveToken(options, connection, new AbortController().signal)).toBe("auth_tokens/ephemeral");
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/auth_tokens");
    expect(init.headers["x-goog-api-key"]).toBe(connection.apiKey);
    const body = JSON.parse(init.body);
    expect(body.uses).toBe(1);
    expect(body.bidiGenerateContentSetup).toEqual(geminiLiveSetup(options));
    expect(body.bidiGenerateContentSetup.systemInstruction.parts[0].text).toContain("日本語");
    expect(init.body).not.toContain(connection.apiKey);
  });
  it("offers only semantic search when direct file access is off", () => {
    const setup = geminiLiveSetup({ ...options, fileAccess: false });
    expect(setup.tools?.[0].functionDeclarations.map(tool => tool.name)).toEqual(["rag_search"]);
  });
  it.each([{}, { name: "permanent-key" }, { name: "auth_tokens/invalid token" }])("rejects an invalid token response: %j", async body => {
    request.mockResolvedValue(Response.json(body));
    await expect(createGeminiLiveToken(options, connection, new AbortController().signal)).rejects.toThrow("Invalid Gemini Live token");
  });
  it("redacts saved keys from HTTP and transport errors", async () => {
    request.mockResolvedValue(new Response("Invalid private-api-key", { status: 401 }));
    await expect(createGeminiLiveToken(options, connection, new AbortController().signal)).rejects.toThrow("[redacted]");
    request.mockRejectedValue(new Error("Network private-api-key"));
    await expect(createGeminiLiveToken(options, connection, new AbortController().signal)).rejects.toThrow("Network [redacted]");
  });
  it("does not accept a late token after cancellation", async () => {
    const abort = new AbortController();
    request.mockImplementation(async () => { abort.abort(); return Response.json({ name: "auth_tokens/late" }); });
    await expect(createGeminiLiveToken(options, connection, abort.signal)).rejects.toThrow();
  });
  it("does not request credentials after cancellation", async () => {
    const abort = new AbortController(); abort.abort();
    await expect(createGeminiLiveToken(options, connection, abort.signal)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
