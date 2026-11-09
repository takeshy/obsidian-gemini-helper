import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "src/types";
import { LiveChatHistory } from "./liveChatHistory";

const original: Message[] = [{ role: "user", content: "Prior text", timestamp: 1 }];
const turn = (content: string): Message[] => [{ role: "assistant", content, timestamp: 2 }];
beforeEach(() => { vi.stubGlobal("window", globalThis); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Live chat history", () => {
  it("replaces partial speech without duplicating the original chat or earlier fragments", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const history = new LiveChatHistory(original, save, vi.fn());
    expect(history.update(turn("Hel"))).toEqual([...original, ...turn("Hel")]);
    expect(history.update(turn("Hello"))).toEqual([...original, ...turn("Hello")]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledExactlyOnceWith([...original, ...turn("Hello")]);
    await history.finish(turn("Hello!"));
    expect(history.messages).toEqual([...original, ...turn("Hello!")]);
    expect(save).toHaveBeenLastCalledWith(history.messages);
  });

  it("serializes the final save after any pending checkpoint", async () => {
    let complete!: () => void;
    const checkpoint = new Promise<void>(resolve => { complete = resolve; });
    const save = vi.fn().mockReturnValueOnce(checkpoint).mockResolvedValue(undefined);
    const history = new LiveChatHistory(original, save, vi.fn());
    history.update(turn("Partial"));
    await vi.advanceTimersByTimeAsync(1000);
    const finishing = history.finish(turn("Final"));
    expect(save).toHaveBeenCalledTimes(1);
    complete(); await finishing;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith([...original, ...turn("Final")]);
  });

  it("cancels the debounce on finish, ignores late updates, and finishes only once", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const history = new LiveChatHistory(original, save, vi.fn());
    history.update(turn("Partial"));
    await history.finish(turn("Final"));
    expect(history.update(turn("Late"))).toBeNull();
    await history.finish(turn("Duplicate"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledExactlyOnceWith([...original, ...turn("Final")]);
  });

  it("lets text chat wait for the final save before persisting its continuation", async () => {
    let complete!: () => void;
    const checkpoint = new Promise<void>(resolve => { complete = resolve; });
    const save = vi.fn().mockReturnValueOnce(checkpoint).mockResolvedValue(undefined);
    const history = new LiveChatHistory(original, save, vi.fn());
    history.update(turn("Partial"));
    await vi.advanceTimersByTimeAsync(1000);
    const finalSave = history.finish(turn("Final"));
    const continuation = [...history.messages, { role: "user" as const, content: "Continue by text", timestamp: 3 }];
    const textSave = finalSave.then(() => save(continuation));
    expect(save).toHaveBeenCalledTimes(1);
    complete(); await textSave;
    expect(save.mock.calls.map(([messages]) => messages.at(-1).content)).toEqual(["Partial", "Final", "Continue by text"]);
  });

  it("does not save a cancelled setup or a call without speech", async () => {
    const save = vi.fn();
    const history = new LiveChatHistory(original, save, vi.fn());
    history.update([]); await history.finish([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it("reports checkpoint errors and still saves the final transcript", async () => {
    const error = new Error("Disk unavailable"), onError = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const history = new LiveChatHistory(original, save, onError);
    history.update(turn("Partial"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledWith(error);
    await history.finish(turn("Final"));
    expect(save).toHaveBeenLastCalledWith([...original, ...turn("Final")]);
  });
});
