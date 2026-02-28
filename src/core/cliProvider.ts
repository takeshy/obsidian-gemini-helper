/**
 * CLI Provider abstraction layer
 * Allows using Gemini CLI, Claude CLI, or Codex CLI as chat backend
 *
 * Requirements:
 * - Non-Windows: CLI commands (`gemini`, `claude`, `codex`) must be in PATH
 * - Windows: The actual .js script must be found in npm global node_modules
 *   (searches %APPDATA%\npm, %PROGRAMFILES%\nodejs, and PATH-based locations)
 *   Note: On Windows, we run scripts with `node` directly because npm creates
 *   .cmd wrapper scripts that require shell: true, which is a security risk.
 *
 * Note: child_process is dynamically imported to avoid loading on mobile
 */

import { Platform } from "obsidian";
import type { Message, StreamChunk, ChatProvider } from "../types";

// Type for ChildProcess (avoid static import)
type ChildProcessType = import("child_process").ChildProcess;

/**
 * Load child_process on desktop only.
 */
function getChildProcess(): typeof import("child_process") {
  const loader =
    (globalThis as unknown as { require?: (id: string) => unknown }).require ||
    (globalThis as unknown as { module?: { require?: (id: string) => unknown } }).module?.require;
  if (!loader) {
    throw new Error("child_process is not available in this environment");
  }
  return loader("child_process") as typeof import("child_process");
}

/**
 * Check if running on Windows (only evaluated on desktop)
 */
export function isWindows(): boolean {
  if (Platform.isMobile) return false;
  return typeof process !== "undefined" && process.platform === "win32";
}

/**
 * Result of CLI path validation
 */
export type CliPathValidationResult =
  | { valid: true }
  | { valid: false; reason: "invalid_chars" | "file_not_found" };

/**
 * Validate custom CLI path for security
 * - Must not contain shell metacharacters
 * - Must exist as a file
 */
export function validateCliPath(path: string): CliPathValidationResult {
  // Check for shell metacharacters that could be used for injection
  const dangerousChars = /[;&|`$(){}[\]<>!#*?\\'"]/;
  // Allow backslash on Windows for path separators
  if (isWindows()) {
    const dangerousCharsWindows = /[;&|`$(){}[\]<>!#*?'"]/;
    if (dangerousCharsWindows.test(path.replace(/\\/g, ""))) {
      return { valid: false, reason: "invalid_chars" };
    }
  } else if (dangerousChars.test(path)) {
    return { valid: false, reason: "invalid_chars" };
  }

  // Verify file exists
  if (!fileExistsSync(path)) {
    return { valid: false, reason: "file_not_found" };
  }

  return { valid: true };
}

// Internal function for backward compatibility
function validateCustomPath(path: string): boolean {
  return validateCliPath(path).valid;
}

/**
 * Resolve the Gemini CLI command and arguments
 * Always uses shell: false for security
 *
 * On Windows, we must find the actual .js script and run it with node,
 * because npm creates .cmd wrapper scripts that require shell: true.
 *
 * @param args - Command line arguments to pass to the CLI
 * @param customPath - Optional custom path to the CLI script/executable
 */
function resolveGeminiCommand(args: string[], customPath?: string): { command: string; args: string[] } {
  // If custom path is specified, validate and use it
  if (customPath && validateCustomPath(customPath)) {
    if (isWindows()) {
      // On Windows, run with node
      return { command: "node", args: [customPath, ...args] };
    }
    // Non-Windows: execute directly
    return { command: customPath, args };
  }

  // On Windows, find the npm package script (required because .cmd scripts need shell: true)
  if (isWindows()) {
    const scriptPath = findWindowsNpmScript("@google\\gemini-cli\\dist\\index.js");
    if (scriptPath) {
      return { command: "node", args: [scriptPath, ...args] };
    }
    // If not found, return node with the expected path (will fail with helpful error)
    const appdata = process.env?.APPDATA;
    const fallbackPath = appdata
      ? `${appdata}\\npm\\node_modules\\@google\\gemini-cli\\dist\\index.js`
      : "@google\\gemini-cli\\dist\\index.js";
    return { command: "node", args: [fallbackPath, ...args] };
  }

  // Non-Windows: check common installation paths first (Obsidian may not have full PATH)
  if (typeof process !== "undefined") {
    const home = process.env?.HOME;
    const candidatePaths: string[] = [];

    if (home) {
      // Linux/Mac: ~/.local/bin/gemini
      candidatePaths.push(`${home}/.local/bin/gemini`);
      // npm global with custom prefix: ~/.npm-global/bin/gemini
      candidatePaths.push(`${home}/.npm-global/bin/gemini`);
    }

    // Mac: Homebrew paths
    // Apple Silicon
    candidatePaths.push("/opt/homebrew/bin/gemini");
    // Intel Mac
    candidatePaths.push("/usr/local/bin/gemini");

    for (const path of candidatePaths) {
      if (fileExistsSync(path)) {
        return { command: path, args };
      }
    }
  }

  // Fallback: use gemini command directly (must be in PATH)
  return { command: "gemini", args };
}

function formatWindowsCliError(message: string | undefined): string | undefined {
  if (!isWindows()) return message;
  if (!message) {
    return "Gemini CLI not found. Install it with `npm install -g @google/gemini-cli` and ensure it is in your PATH.";
  }
  if (
    message.includes("Cannot find module") ||
    message.includes("MODULE_NOT_FOUND") ||
    message.includes("@google\\gemini-cli") ||
    message.includes("ENOENT")
  ) {
    return "Gemini CLI not found. Install it with `npm install -g @google/gemini-cli` and ensure it is in your PATH.";
  }
  return message;
}

/**
 * Check if a file exists (synchronously) - only for desktop
 */
function fileExistsSync(path: string): boolean {
  try {
    const loader =
      (globalThis as unknown as { require?: (id: string) => unknown }).require ||
      (globalThis as unknown as { module?: { require?: (id: string) => unknown } }).module?.require;
    if (!loader) return false;
    const fs = loader("fs") as typeof import("fs");
    return fs.existsSync(path);
  } catch {
    return false;
  }
}

/**
 * Get candidate Windows npm global node_modules paths
 * Returns paths where npm packages might be installed globally
 */
function getWindowsNpmPaths(): string[] {
  if (!isWindows() || typeof process === "undefined") return [];

  const paths: string[] = [];
  const env = process.env;

  // 1. Default npm global prefix: %APPDATA%\npm
  if (env?.APPDATA) {
    paths.push(`${env.APPDATA}\\npm\\node_modules`);
  }

  // 2. Node.js installation directory (all users): %PROGRAMFILES%\nodejs
  if (env?.PROGRAMFILES) {
    paths.push(`${env.PROGRAMFILES}\\nodejs\\node_modules`);
  }

  // 3. Node.js x86 on 64-bit Windows: %PROGRAMFILES(X86)%\nodejs
  const programFilesX86 = env?.["PROGRAMFILES(X86)"];
  if (programFilesX86) {
    paths.push(`${programFilesX86}\\nodejs\\node_modules`);
  }

  // 4. Custom npm prefix from PATH - look for node.exe location
  if (env?.PATH) {
    const pathDirs = env.PATH.split(";");
    for (const dir of pathDirs) {
      if (!dir) continue;
      // Check if this directory contains node.exe (indicates Node.js installation)
      if (fileExistsSync(`${dir}\\node.exe`)) {
        // npm global packages are typically in node_modules sibling to node.exe
        paths.push(`${dir}\\node_modules`);
      }
      // Also check for npm directory (npm global prefix)
      if (dir.toLowerCase().includes("npm") && fileExistsSync(`${dir}\\node_modules`)) {
        paths.push(`${dir}\\node_modules`);
      }
    }
  }

  // Remove duplicates
  return [...new Set(paths)];
}

/**
 * Find a Windows npm package script by checking multiple locations
 * Returns the full path to the script if found, undefined otherwise
 */
function findWindowsNpmScript(packagePath: string): string | undefined {
  const npmPaths = getWindowsNpmPaths();
  for (const npmPath of npmPaths) {
    const scriptPath = `${npmPath}\\${packagePath}`;
    if (fileExistsSync(scriptPath)) {
      return scriptPath;
    }
  }
  return undefined;
}

/**
 * Resolve the Claude CLI command and arguments
 * Always uses shell: false for security
 *
 * On Windows, we must find the actual .js script and run it with node,
 * because npm creates .cmd wrapper scripts that require shell: true.
 *
 * @param args - Command line arguments to pass to the CLI
 * @param customPath - Optional custom path to the CLI script/executable
 */
function resolveClaudeCommand(args: string[], customPath?: string): { command: string; args: string[] } {
  // If custom path is specified, validate and use it
  if (customPath && validateCustomPath(customPath)) {
    if (isWindows()) {
      // Check if it's an .exe file
      if (customPath.toLowerCase().endsWith(".exe")) {
        return { command: customPath, args };
      }
      // Otherwise, run with node
      return { command: "node", args: [customPath, ...args] };
    }
    // Non-Windows: execute directly
    return { command: customPath, args };
  }

  // On Windows, find the npm package script or standalone exe
  if (isWindows() && typeof process !== "undefined") {
    // First, try to find the npm package script
    const scriptPath = findWindowsNpmScript("@anthropic-ai\\claude-code\\cli.js");
    if (scriptPath) {
      return { command: "node", args: [scriptPath, ...args] };
    }

    // Try standalone Claude installation at LOCALAPPDATA
    const localAppdata = process.env?.LOCALAPPDATA;
    if (localAppdata) {
      const exePath = `${localAppdata}\\Programs\\claude\\claude.exe`;
      if (fileExistsSync(exePath)) {
        return { command: exePath, args };
      }
    }

    // If not found, return node with the expected path (will fail with helpful error)
    const appdata = process.env?.APPDATA;
    const fallbackPath = appdata
      ? `${appdata}\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js`
      : "@anthropic-ai\\claude-code\\cli.js";
    return { command: "node", args: [fallbackPath, ...args] };
  }

  // Non-Windows: check common installation paths first (Obsidian may not have full PATH)
  if (typeof process !== "undefined") {
    const home = process.env?.HOME;
    const candidatePaths: string[] = [];

    if (home) {
      // Linux/Mac: ~/.local/bin/claude
      candidatePaths.push(`${home}/.local/bin/claude`);
      // npm global with custom prefix: ~/.npm-global/bin/claude
      candidatePaths.push(`${home}/.npm-global/bin/claude`);
    }

    // Mac: Homebrew paths
    // Apple Silicon
    candidatePaths.push("/opt/homebrew/bin/claude");
    // Intel Mac
    candidatePaths.push("/usr/local/bin/claude");

    for (const path of candidatePaths) {
      if (fileExistsSync(path)) {
        return { command: path, args };
      }
    }
  }

  // Fallback: use claude command directly (must be in PATH)
  return { command: "claude", args };
}

function formatWindowsClaudeCliError(message: string | undefined): string | undefined {
  if (!isWindows()) return message;
  if (!message) {
    return "Claude CLI not found. Install it with `npm install -g @anthropic-ai/claude-code` and ensure it is in your PATH.";
  }
  if (
    message.includes("Cannot find module") ||
    message.includes("MODULE_NOT_FOUND") ||
    message.includes("@anthropic-ai\\claude-code") ||
    message.includes("ENOENT")
  ) {
    return "Claude CLI not found. Install it with `npm install -g @anthropic-ai/claude-code` and ensure it is in your PATH.";
  }
  return message;
}

/**
 * Resolve the Codex CLI command and arguments
 * Always uses shell: false for security
 *
 * On Windows, we must find the actual .js script and run it with node,
 * because npm creates .cmd wrapper scripts that require shell: true.
 *
 * @param args - Command line arguments to pass to the CLI
 * @param customPath - Optional custom path to the CLI script/executable
 */
function resolveCodexCommand(args: string[], customPath?: string): { command: string; args: string[] } {
  // If custom path is specified, validate and use it
  if (customPath && validateCustomPath(customPath)) {
    if (isWindows()) {
      // On Windows, run with node
      return { command: "node", args: [customPath, ...args] };
    }
    // Non-Windows: execute directly
    return { command: customPath, args };
  }

  // On Windows, find the npm package script (required because .cmd scripts need shell: true)
  if (isWindows()) {
    const scriptPath = findWindowsNpmScript("@openai\\codex\\bin\\codex.js");
    if (scriptPath) {
      return { command: "node", args: [scriptPath, ...args] };
    }
    // If not found, return node with the expected path (will fail with helpful error)
    const appdata = process.env?.APPDATA;
    const fallbackPath = appdata
      ? `${appdata}\\npm\\node_modules\\@openai\\codex\\bin\\codex.js`
      : "@openai\\codex\\bin\\codex.js";
    return { command: "node", args: [fallbackPath, ...args] };
  }

  // Non-Windows: check common installation paths first (Obsidian may not have full PATH)
  if (typeof process !== "undefined") {
    const home = process.env?.HOME;
    const candidatePaths: string[] = [];

    if (home) {
      // Linux/Mac: ~/.local/bin/codex
      candidatePaths.push(`${home}/.local/bin/codex`);
      // npm global with custom prefix: ~/.npm-global/bin/codex
      candidatePaths.push(`${home}/.npm-global/bin/codex`);
    }

    // Mac: Homebrew paths
    // Apple Silicon
    candidatePaths.push("/opt/homebrew/bin/codex");
    // Intel Mac
    candidatePaths.push("/usr/local/bin/codex");

    for (const path of candidatePaths) {
      if (fileExistsSync(path)) {
        return { command: path, args };
      }
    }
  }

  // Fallback: use codex command directly (must be in PATH)
  return { command: "codex", args };
}

function formatWindowsCodexCliError(message: string | undefined): string | undefined {
  if (!isWindows()) return message;
  if (!message) {
    return "Codex CLI not found. Install it with `npm install -g @openai/codex` and ensure it is in your PATH.";
  }
  if (
    message.includes("Cannot find module") ||
    message.includes("MODULE_NOT_FOUND") ||
    message.includes("@openai\\codex") ||
    message.includes("ENOENT")
  ) {
    return "Codex CLI not found. Install it with `npm install -g @openai/codex` and ensure it is in your PATH.";
  }
  return message;
}

export interface CliProviderInterface {
  name: ChatProvider;
  displayName: string;
  supportsSessionResumption: boolean;  // Whether this provider supports session resumption
  isAvailable(): Promise<boolean>;
  chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal,
    sessionId?: string  // Optional session ID for resumption
  ): AsyncGenerator<StreamChunk>;
}

/**
 * Format conversation history as a prompt string
 */
function formatHistoryAsPrompt(messages: Message[], systemPrompt: string): string {
  const parts: string[] = [];

  if (systemPrompt) {
    parts.push(`System: ${systemPrompt}\n`);
  }

  // Include conversation history (excluding the last user message)
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const role = msg.role === "user" ? "User" : "Assistant";
    parts.push(`${role}: ${msg.content}\n`);
  }

  // Add the current user message
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && lastMessage.role === "user") {
    parts.push(`User: ${lastMessage.content}`);
  }

  return parts.join("\n");
}

/**
 * Base CLI provider class
 */
abstract class BaseCliProvider implements CliProviderInterface {
  abstract name: ChatProvider;
  abstract displayName: string;
  abstract supportsSessionResumption: boolean;

  /**
   * Resolve the CLI command for version check
   */
  protected abstract resolveVersionCommand(): { command: string; args: string[] };

  async isAvailable(): Promise<boolean> {
    // CLI is not available on mobile
    if (Platform.isMobile) {
      return false;
    }

    try {
      const { spawn } = getChildProcess();
      const { command, args } = this.resolveVersionCommand();

      return new Promise((resolve) => {
        try {
          const proc = spawn(command, args, {
            stdio: ["pipe", "pipe", "pipe"],
            shell: false,
            env: typeof process !== "undefined" ? process.env : undefined,
          });

          proc.on("close", (code: number | null) => {
            resolve(code === 0);
          });

          proc.on("error", () => {
            resolve(false);
          });

          // Timeout after 30 seconds
          setTimeout(() => {
            proc.kill();
            resolve(false);
          }, 30000);
        } catch {
          resolve(false);
        }
      });
    } catch {
      return false;
    }
  }

  abstract chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal,
    sessionId?: string
  ): AsyncGenerator<StreamChunk>;
}

/**
 * Gemini CLI provider
 * Uses: gemini -p "prompt"
 * Note: Gemini CLI does not support session resumption
 */
export class GeminiCliProvider extends BaseCliProvider {
  name: ChatProvider = "gemini-cli";
  displayName = "Gemini CLI";
  supportsSessionResumption = false;

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveGeminiCommand(["--version"]);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal,
    _sessionId?: string  // Unused - Gemini CLI doesn't support session resumption
  ): AsyncGenerator<StreamChunk> {
    // Dynamically import child_process (not available on mobile)
    const { spawn } = getChildProcess();

    const prompt = formatHistoryAsPrompt(messages, systemPrompt);

    const { command, args } = resolveGeminiCommand(["-p", prompt]);
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd: workingDirectory,
      env: typeof process !== "undefined" ? process.env : undefined,
    });

    // Handle abort
    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    }

    yield* this.processOutput(proc);
  }

  private async *processOutput(proc: ChildProcessType): AsyncGenerator<StreamChunk> {
    // Process stdout
    if (proc.stdout) {
      proc.stdout.setEncoding("utf8");

      for await (const chunk of proc.stdout) {
        yield { type: "text", content: chunk };
      }
    }

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Gemini CLI exited with code ${code}`));
        }
      });
      proc.on("error", reject);
    });

    // Check for errors in stderr
    if (proc.stderr) {
      let stderr = "";
      proc.stderr.setEncoding("utf8");
      for await (const chunk of proc.stderr) {
        stderr += chunk;
      }
      if (stderr) {
        yield { type: "error", error: stderr };
      }
    }

    yield { type: "done" };
  }
}

/**
 * Claude CLI provider
 * Uses: claude -p "prompt" --output-format stream-json
 * Supports session resumption with --resume sessionId
 */
export class ClaudeCliProvider extends BaseCliProvider {
  name: ChatProvider = "claude-cli";
  displayName = "Claude CLI";
  supportsSessionResumption = true;

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveClaudeCommand(["--version"]);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal,
    sessionId?: string  // When provided, resume this session instead of passing full history
  ): AsyncGenerator<StreamChunk> {
    // Dynamically import child_process (not available on mobile)
    const { spawn } = getChildProcess();

    // Build CLI arguments based on whether we have a session ID
    let cliArgs: string[];

    if (sessionId) {
      // Resuming an existing session - only send the latest user message
      const lastMessage = messages[messages.length - 1];
      const prompt = lastMessage?.role === "user" ? lastMessage.content : "";

      cliArgs = [
        "--resume", sessionId,
        "-p", prompt,
        "--output-format", "stream-json",
        "--verbose"
      ];
    } else {
      // First message - send full history with system prompt
      const prompt = formatHistoryAsPrompt(messages, systemPrompt);

      cliArgs = [
        "-p", prompt,
        "--output-format", "stream-json",
        "--verbose"
      ];
    }

    const { command, args } = resolveClaudeCommand(cliArgs);
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd: workingDirectory,
      env: typeof process !== "undefined" ? process.env : undefined,
    });

    // Close stdin immediately to signal no more input
    proc.stdin?.end();

    // Handle abort
    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    }

    yield* this.processOutput(proc);
  }

  private async *processOutput(proc: ChildProcessType): AsyncGenerator<StreamChunk> {
    // Process stdout - Claude CLI with --output-format stream-json outputs JSON lines
    if (proc.stdout) {
      proc.stdout.setEncoding("utf8");
      let buffer = "";
      const state = { sessionIdEmitted: false };

      for await (const chunk of proc.stdout) {
        buffer += chunk;

        // Process complete JSON lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";  // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          yield* this.processJsonLine(line, state);
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        yield* this.processJsonLine(buffer, state);
      }
    }

    yield { type: "done" };
  }

  /**
   * Process a single JSON line from Claude CLI stream-json output
   */
  private *processJsonLine(
    line: string,
    state: { sessionIdEmitted: boolean }
  ): Generator<StreamChunk> {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      // Handle different message types from Claude CLI stream-json format
      if (parsed.type === "assistant") {
        // Assistant message with content
        const message = parsed.message as Record<string, unknown> | undefined;
        if (message && Array.isArray(message.content)) {
          for (const block of message.content as Array<Record<string, unknown>>) {
            if (block.type === "text" && typeof block.text === "string") {
              yield { type: "text", content: block.text };
            }
          }
        }
      } else if (parsed.type === "content_block_delta") {
        // Streaming delta
        const delta = parsed.delta as Record<string, unknown> | undefined;
        if (delta && delta.type === "text_delta" && typeof delta.text === "string") {
          yield { type: "text", content: delta.text };
        }
      } else if (parsed.type === "error") {
        // Error message
        const error = parsed.error as Record<string, unknown> | undefined;
        const errorMessage = typeof error?.message === "string" ? error.message : (typeof parsed.message === "string" ? parsed.message : "Unknown error");
        yield { type: "error", error: errorMessage };
      }

      // Check for session_id (can appear in assistant or result messages)
      if (!state.sessionIdEmitted) {
        let sessionId: string | undefined;

        // Check direct session_id field (assistant message)
        if (typeof parsed.session_id === "string") {
          sessionId = parsed.session_id;
        }
        // Check result.data.session_id (result message)
        else if (parsed.type === "result") {
          const data = parsed.data as Record<string, unknown> | undefined;
          if (data && typeof data.session_id === "string") {
            sessionId = data.session_id;
          }
        }

        if (sessionId) {
          yield { type: "session_id", sessionId };
          state.sessionIdEmitted = true;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
}

/**
 * Codex CLI provider
 * Uses: codex exec "prompt" --json --skip-git-repo-check
 * Supports session resumption with: codex exec resume <sessionId> "prompt"
 */
export class CodexCliProvider extends BaseCliProvider {
  name: ChatProvider = "codex-cli";
  displayName = "Codex CLI";
  supportsSessionResumption = true;

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveCodexCommand(["--version"]);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal,
    sessionId?: string  // When provided, resume this session
  ): AsyncGenerator<StreamChunk> {
    // Dynamically import child_process (not available on mobile)
    const { spawn } = getChildProcess();

    // Build CLI arguments based on whether we have a session ID
    // Note: --json and --skip-git-repo-check are options for 'exec', must come before subcommands
    let cliArgs: string[];

    if (sessionId) {
      // Resuming an existing session - only send the latest user message
      const lastMessage = messages[messages.length - 1];
      const prompt = lastMessage?.role === "user" ? lastMessage.content : "";

      cliArgs = ["exec", "--json", "--skip-git-repo-check", "resume", sessionId, prompt];
    } else {
      // First message - send full history with system prompt
      const prompt = formatHistoryAsPrompt(messages, systemPrompt);

      cliArgs = ["exec", "--json", "--skip-git-repo-check", prompt];
    }

    const { command, args } = resolveCodexCommand(cliArgs);
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd: workingDirectory,
      env: typeof process !== "undefined" ? process.env : undefined,
    });

    // Close stdin immediately to signal no more input
    proc.stdin?.end();

    // Handle abort
    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    }

    yield* this.processOutput(proc);
  }

  private async *processOutput(proc: ChildProcessType): AsyncGenerator<StreamChunk> {
    // Process stdout - Codex CLI with --json outputs newline-delimited JSON
    if (proc.stdout) {
      proc.stdout.setEncoding("utf8");
      let buffer = "";
      const state = { sessionIdEmitted: false };

      for await (const chunk of proc.stdout) {
        buffer += chunk;

        // Process complete JSON lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";  // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          yield* this.processJsonLine(line, state);
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        yield* this.processJsonLine(buffer, state);
      }
    }

    yield { type: "done" };
  }

  /**
   * Process a single JSON line from Codex CLI output
   */
  private *processJsonLine(
    line: string,
    state: { sessionIdEmitted: boolean }
  ): Generator<StreamChunk> {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      // Handle thread.started event - extract thread_id for session resumption
      if (parsed.type === "thread.started" && typeof parsed.thread_id === "string") {
        if (!state.sessionIdEmitted) {
          yield { type: "session_id", sessionId: parsed.thread_id };
          state.sessionIdEmitted = true;
        }
      }
      // Handle Codex CLI JSON format
      else if (parsed.type === "item.completed") {
        const item = parsed.item as Record<string, unknown> | undefined;
        if (item && item.type === "agent_message" && typeof item.text === "string") {
          yield { type: "text", content: item.text };
        }
      } else if (parsed.type === "error") {
        const errorMessage = typeof parsed.message === "string" ? parsed.message : (typeof parsed.error === "string" ? parsed.error : "Unknown error");
        yield { type: "error", error: errorMessage };
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
}

/**
 * CLI Provider Manager
 * Manages provider instances and selection
 */
export class CliProviderManager {
  private providers: Map<ChatProvider, CliProviderInterface> = new Map();

  constructor() {
    this.providers.set("gemini-cli", new GeminiCliProvider());
    this.providers.set("claude-cli", new ClaudeCliProvider());
    this.providers.set("codex-cli", new CodexCliProvider());
  }

  getProvider(name: ChatProvider): CliProviderInterface | undefined {
    return this.providers.get(name);
  }

  async getAvailableProviders(): Promise<ChatProvider[]> {
    const available: ChatProvider[] = [];

    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(name);
      }
    }

    return available;
  }

  async isProviderAvailable(name: ChatProvider): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) return false;
    return provider.isAvailable();
  }
}

// Singleton instance
let cliProviderManager: CliProviderManager | null = null;

export function initCliProviderManager(): CliProviderManager {
  cliProviderManager = new CliProviderManager();
  return cliProviderManager;
}

export function getCliProviderManager(): CliProviderManager | null {
  return cliProviderManager;
}

/**
 * Check if we're using a CLI provider
 */
export function isCliProvider(provider: ChatProvider): boolean {
  return provider !== "api";
}

export interface CliVerifyResult {
  success: boolean;
  stage: "version" | "login";
  error?: string;
}

/**
 * Verify Gemini CLI installation and login status
 * @param customPath - Optional custom path to the CLI script/executable
 */
export async function verifyCli(customPath?: string): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  // Dynamically import child_process (not available on mobile)
  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveGeminiCommand(["--version"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: formatWindowsCliError(stderr) || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: formatWindowsCliError(err.message) });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: formatWindowsCliError("Timeout") });
      }, 30000);
    } catch (err) {
      resolve({ success: false, error: formatWindowsCliError(String(err)) });
    }
  });

  if (!versionCheck.success) {
    return { success: false, stage: "version", error: versionCheck.error || "Gemini CLI not found" };
  }

  // Step 2: Check if logged in (run a simple prompt)
  const loginCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveGeminiCommand(["-p", "Hello"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: formatWindowsCliError(stderr) || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: formatWindowsCliError(err.message) });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: formatWindowsCliError("Timeout - CLI may not be logged in") });
      }, 30000);
    } catch (err) {
      resolve({ success: false, error: formatWindowsCliError(String(err)) });
    }
  });

  if (!loginCheck.success) {
    return { success: false, stage: "login", error: loginCheck.error || "Please run 'gemini' in terminal to log in" };
  }

  return { success: true, stage: "login" };
}

/**
 * Verify Claude CLI installation and login status
 * @param customPath - Optional custom path to the CLI script/executable
 */
export async function verifyClaudeCli(customPath?: string): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  // Dynamically import child_process (not available on mobile)
  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveClaudeCommand(["--version"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately to signal no more input
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: formatWindowsClaudeCliError(stderr) || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: formatWindowsClaudeCliError(err.message) });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: formatWindowsClaudeCliError("Timeout") });
      }, 30000);
    } catch (err) {
      resolve({ success: false, error: formatWindowsClaudeCliError(String(err)) });
    }
  });

  if (!versionCheck.success) {
    return { success: false, stage: "version", error: versionCheck.error || "Claude CLI not found" };
  }

  // Step 2: Check if logged in (run a simple prompt)
  const loginCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveClaudeCommand(["-p", "Hello", "--output-format", "text"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately to signal no more input
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      // Drain stdout to prevent buffer blocking
      proc.stdout?.on("data", () => {
        // Ignore stdout data, just drain the buffer
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: formatWindowsClaudeCliError(stderr) || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: formatWindowsClaudeCliError(err.message) });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: formatWindowsClaudeCliError("Timeout - CLI may not be logged in") });
      }, 30000);
    } catch (err) {
      resolve({ success: false, error: formatWindowsClaudeCliError(String(err)) });
    }
  });

  if (!loginCheck.success) {
    return { success: false, stage: "login", error: loginCheck.error || "Please run 'claude' in terminal to log in" };
  }

  return { success: true, stage: "login" };
}

/**
 * Verify Codex CLI installation and login status
 * @param customPath - Optional custom path to the CLI script/executable
 */
export async function verifyCodexCli(customPath?: string): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  // Dynamically import child_process (not available on mobile)
  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveCodexCommand(["--version"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately to signal no more input
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: formatWindowsCodexCliError(stderr) || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: formatWindowsCodexCliError(err.message) });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: formatWindowsCodexCliError("Timeout") });
      }, 30000);
    } catch (err) {
      resolve({ success: false, error: formatWindowsCodexCliError(String(err)) });
    }
  });

  if (!versionCheck.success) {
    return { success: false, stage: "version", error: versionCheck.error || "Codex CLI not found" };
  }

  // Step 2: Check if logged in (run a simple prompt)
  const loginCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveCodexCommand(["exec", "Hello", "--json", "--skip-git-repo-check"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately to signal no more input
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      // Drain stdout to prevent buffer blocking
      proc.stdout?.on("data", () => {
        // Ignore stdout data, just drain the buffer
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: formatWindowsCodexCliError(stderr) || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: formatWindowsCodexCliError(err.message) });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: formatWindowsCodexCliError("Timeout - CLI may not be logged in") });
      }, 60000);
    } catch (err) {
      resolve({ success: false, error: formatWindowsCodexCliError(String(err)) });
    }
  });

  if (!loginCheck.success) {
    return { success: false, stage: "login", error: loginCheck.error || "Please run 'codex' in terminal to log in" };
  }

  return { success: true, stage: "login" };
}
