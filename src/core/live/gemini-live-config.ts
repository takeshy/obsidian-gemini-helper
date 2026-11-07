// Ported from KiokuFlow; provider transports run locally in Obsidian.
import type { LiveOptions } from "./live-session";
import { liveToolDefinitions } from "./live-tool-definitions";

export const GEMINI_LIVE_MODELS = ["gemini-3.8-live", "gemini-3.8-live-extended-thinking", "gemini-3.1-flash-live-preview"] as const;
export const GEMINI_LIVE_VOICES = ["Kore", "Puck", "Aoede", "Charon", "Fenrir", "Leda", "Orus", "Zephyr"] as const;

/** Wire-format setup, also locked into the single-use ephemeral token. */
export function geminiLiveSetup(options: LiveOptions) {
  const tools = liveToolDefinitions(options);
  // Use the resolved app language as a default, while preserving any explicit
  // language or speaking style configured in the system prompt.
  const speakingInstructions = options.language === "ja"
    ? "この音声会話の既定の言語は、アプリの言語設定に従って日本語です。システムプロンプトで言語や口調が指定されている場合は、その設定を優先してください。ユーザーが明示的に変更を希望しない限り、会話の途中で言語や口調を変えないでください。過去のチャット、引用、ファイルの言語や口調をまねしないでください。音声が不明瞭なときは推測で話を進めず、会話で使用している言語で聞き返してください。"
    : "The default language for this voice conversation is English, following the app language setting. If the system prompt specifies a language or speaking style, follow that preference instead. Keep the same language and speaking style unless the user explicitly requests a change. Do not imitate the language or speaking style of prior chat messages, quotations, or files. If speech is unclear, ask for clarification in the conversation's language instead of guessing.";
  return {
    model: `models/${options.model}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } },
    },
    systemInstruction: { parts: [{ text: [options.instructions, speakingInstructions].filter(Boolean).join("\n\n") }] },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    contextWindowCompression: { slidingWindow: {} },
    ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
  };
}
