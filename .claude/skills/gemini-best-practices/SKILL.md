---
name: gemini-best-practices
description: Review and fix Gemini API usage against Google's official best practices. Use when modifying src/core/gemini.ts, adding new API calls, or auditing Gemini integration quality.
user-invocable: true
disable-model-invocation: false
paths:
  - src/core/gemini.ts
  - src/core/fileSearch.ts
  - src/core/tools.ts
---

# Gemini API Best Practices

When reviewing or modifying Gemini API integration code, ensure compliance with Google's official best practices from `google-gemini/gemini-skills`.

## SDK and Package

- **Correct SDK**: `@google/genai` (npm)
- **NEVER use deprecated**: `@google/generative-ai` (old package)
- Prefer environment variables for API keys over hard-coding

## Safety Settings

All API calls (`generateContent`, `generateContentStream`, `chats.create`) MUST include `safetySettings` in the config:

```typescript
import { HarmCategory, HarmBlockThreshold, type SafetySetting } from "@google/genai";

const DEFAULT_SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];
```

## Response Validation (finishReason)

Always check `finishReason` on response candidates:

- `SAFETY` - Response blocked by safety filters; inform user to rephrase
- `RECITATION` - Blocked due to potential copyrighted content recitation
- `MAX_TOKENS` - Output truncated; consider informing user
- `STOP` - Normal completion

```typescript
import { FinishReason } from "@google/genai";

// Check candidates[0].finishReason after each response
if (candidate.finishReason === FinishReason.SAFETY) {
  // Handle blocked response
}
```

For non-streaming: check `response.candidates[0].finishReason` before using `response.text`.
For streaming: check `finishReason` in chunk candidates.

## System Instructions

- Pass via `systemInstruction` in config (not as a chat message)
- System instructions are interaction-scoped; re-specify on each chat session creation

## Tool / Function Calling

- Pass tools via `config.tools` array
- Use proper SDK types (`Tool`, `FunctionDeclaration`) without forced `as` casts
- `googleSearch` and `fileSearch` are first-class `Tool` properties
- `fileSearch` CANNOT be combined with `functionDeclarations` in the same request
- `googleSearch` CANNOT be combined with `functionDeclarations`

## Streaming

- Use `generateContentStream` or `chat.sendMessageStream` for streaming
- Use SDK Chat (`ai.chats.create()`) for automatic thought signature handling
- Process ALL parts in each chunk (text, thought, functionCall can coexist)

## Thinking / Reasoning

- Thinking is ON by default for Gemini 2.5+ and 3.x models
- `thinkingBudget: 0` disables thinking (except models that require it)
- Gemini 3.1 Flash Lite uses `thinkingLevel` instead of `thinkingBudget`
- Gemini 3 Pro / 3.1 Pro require thinking (cannot be disabled)
- Access thought parts via `part.thought` boolean on content parts

## Model Names

Current models (use these):
- `gemini-3.1-pro-preview` - Flagship, 1M context
- `gemini-3-flash-preview` - Fast, balanced
- `gemini-3.1-flash-lite-preview` - Cost-efficient
- `gemini-2.5-pro` / `gemini-2.5-flash` - Still available

Deprecated models (NEVER use):
- All `gemini-2.0-*`, `gemini-1.5-*`, `gemini-1.0-*`, `gemini-pro`

## Type Safety

- Use proper SDK types from `@google/genai` instead of `as` casts
- `Tool` interface supports `googleSearch`, `fileSearch`, `functionDeclarations`, `codeExecution`, `urlContext`
- Import enums (`FinishReason`, `HarmCategory`, `HarmBlockThreshold`) as values, not just types

## Checklist for New API Calls

- [ ] `safetySettings: DEFAULT_SAFETY_SETTINGS` included in config
- [ ] `finishReason` checked on response candidates
- [ ] `systemInstruction` passed in config (not as message)
- [ ] No forced `as Tool` type assertions
- [ ] Proper error handling with `formatError()`
- [ ] Usage metadata extracted for cost tracking
