/**
 * CLI Provider abstraction layer
 * Allows using Gemini CLI or Claude CLI as chat backend
 *
 * Requirements:
 * - Non-Windows: `gemini` or `claude` command must be in PATH
 * - Windows: CLI must be installed at %APPDATA%\npm or %LOCALAPPDATA%
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
function isWindows(): boolean {
  if (Platform.isMobile) return false;
  return typeof process !== "undefined" && process.platform === "win32";
}

/**
 * Resolve the Gemini CLI command and arguments
 * Always uses shell: false for security
 */
function resolveGeminiCommand(args: string[]): { command: string; args: string[] } {
  // On Windows, resolve to the npm global package at APPDATA
  if (isWindows() && typeof process !== "undefined") {
    const appdata = process.env?.APPDATA;
    const npmPrefix = appdata ? `${appdata}\\npm` : "";

    if (npmPrefix) {
      const scriptPath = `${npmPrefix}\\node_modules\\@google\\gemini-cli\\dist\\index.js`;
      return { command: "node", args: [scriptPath, ...args] };
    }
  }

  // Non-Windows: use gemini command directly (must be in PATH)
  return { command: "gemini", args };
}

function formatWindowsCliError(message: string | undefined): string | undefined {
  if (!isWindows()) return message;
  if (!message) {
    return "Gemini CLI not found. Install it at %APPDATA%\\npm with npm -g.";
  }
  if (
    message.includes("Cannot find module") ||
    message.includes("MODULE_NOT_FOUND") ||
    message.includes("@google\\gemini-cli")
  ) {
    return "Gemini CLI not found at %APPDATA%\\npm. Install it with `npm -g @google/gemini-cli`.";
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
 * Resolve the Claude CLI command and arguments
 * Always uses shell: false for security
 */
function resolveClaudeCommand(args: string[]): { command: string; args: string[] } {
  // On Windows, resolve to the npm global package at APPDATA or LOCALAPPDATA
  if (isWindows() && typeof process !== "undefined") {
    const appdata = process.env?.APPDATA;
    const localAppdata = process.env?.LOCALAPPDATA;

    // Try APPDATA\npm first (npm global installs)
    if (appdata) {
      const npmPath = `${appdata}\\npm`;
      const scriptPath = `${npmPath}\\node_modules\\@anthropic-ai\\claude-code\\cli.js`;
      return { command: "node", args: [scriptPath, ...args] };
    }

    // Fallback to LOCALAPPDATA
    if (localAppdata) {
      const scriptPath = `${localAppdata}\\Programs\\claude\\claude.exe`;
      return { command: scriptPath, args };
    }
  }

  // Non-Windows: check common installation paths first (Obsidian may not have full PATH)
  if (!isWindows() && typeof process !== "undefined") {
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
    return "Claude CLI not found. Install it with `npm install -g @anthropic-ai/claude-code`.";
  }
  if (
    message.includes("Cannot find module") ||
    message.includes("MODULE_NOT_FOUND") ||
    message.includes("@anthropic-ai\\claude-code")
  ) {
    return "Claude CLI not found. Install it with `npm install -g @anthropic-ai/claude-code`.";
  }
  return message;
}

/**
 * Resolve the Codex CLI command and arguments
 * Always uses shell: false for security
 */
function resolveCodexCommand(args: string[]): { command: string; args: string[] } {
  // On Windows, resolve to the npm global package at APPDATA
  if (isWindows() && typeof process !== "undefined") {
    const appdata = process.env?.APPDATA;

    if (appdata) {
      const npmPath = `${appdata}\\npm`;
      const scriptPath = `${npmPath}\\node_modules\\@openai\\codex\\bin\\codex.js`;
      return { command: "node", args: [scriptPath, ...args] };
    }
  }

  // Non-Windows: use codex command directly (must be in PATH)
  return { command: "codex", args };
}

function formatWindowsCodexCliError(message: string | undefined): string | undefined {
  if (!isWindows()) return message;
  if (!message) {
    return "Codex CLI not found. Install it with `npm install -g @openai/codex`.";
  }
  if (
    message.includes("Cannot find module") ||
    message.includes("MODULE_NOT_FOUND") ||
    message.includes("@openai\\codex")
  ) {
    return "Codex CLI not found. Install it with `npm install -g @openai/codex`.";
  }
  return message;
}

export interface CliProviderInterface {
  name: ChatProvider;
  displayName: string;
  isAvailable(): Promise<boolean>;
  chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
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
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk>;
}

/**
 * Gemini CLI provider
 * Uses: gemini -p "prompt"
 */
export class GeminiCliProvider extends BaseCliProvider {
  name: ChatProvider = "gemini-cli";
  displayName = "Gemini CLI";

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveGeminiCommand(["--version"]);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
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
 */
export class ClaudeCliProvider extends BaseCliProvider {
  name: ChatProvider = "claude-cli";
  displayName = "Claude CLI";

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveClaudeCommand(["--version"]);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    // Dynamically import child_process (not available on mobile)
    const { spawn } = getChildProcess();

    const prompt = formatHistoryAsPrompt(messages, systemPrompt);

    // Use -p for non-interactive prompt mode with stream-json output (requires --verbose)
    const { command, args } = resolveClaudeCommand(["-p", prompt, "--output-format", "stream-json", "--verbose"]);
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

      for await (const chunk of proc.stdout) {
        buffer += chunk;

        // Process complete JSON lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";  // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

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
          } catch {
            // Ignore JSON parse errors
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer) as Record<string, unknown>;
          if (parsed.type === "assistant") {
            const message = parsed.message as Record<string, unknown> | undefined;
            if (message && Array.isArray(message.content)) {
              for (const block of message.content as Array<Record<string, unknown>>) {
                if (block.type === "text" && typeof block.text === "string") {
                  yield { type: "text", content: block.text };
                }
              }
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }

    yield { type: "done" };
  }
}

/**
 * Codex CLI provider
 * Uses: codex exec "prompt" --json --skip-git-repo-check
 */
export class CodexCliProvider extends BaseCliProvider {
  name: ChatProvider = "codex-cli";
  displayName = "Codex CLI";

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveCodexCommand(["--version"]);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    // Dynamically import child_process (not available on mobile)
    const { spawn } = getChildProcess();

    const prompt = formatHistoryAsPrompt(messages, systemPrompt);

    // Use exec for non-interactive mode with JSON output
    const { command, args } = resolveCodexCommand(["exec", prompt, "--json", "--skip-git-repo-check"]);
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

      for await (const chunk of proc.stdout) {
        buffer += chunk;

        // Process complete JSON lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";  // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;

            // Handle Codex CLI JSON format
            if (parsed.type === "item.completed") {
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

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer) as Record<string, unknown>;
          if (parsed.type === "item.completed") {
            const item = parsed.item as Record<string, unknown> | undefined;
            if (item && item.type === "agent_message" && typeof item.text === "string") {
              yield { type: "text", content: item.text };
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }

    yield { type: "done" };
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
 */
export async function verifyCli(): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  // Dynamically import child_process (not available on mobile)
  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveGeminiCommand(["--version"]);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
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
      const { command, args } = resolveGeminiCommand(["-p", "Hello"]);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
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
 */
export async function verifyClaudeCli(): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  // Dynamically import child_process (not available on mobile)
  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveClaudeCommand(["--version"]);
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
      const { command, args } = resolveClaudeCommand(["-p", "Hello", "--output-format", "text"]);
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
 */
export async function verifyCodexCli(): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  // Dynamically import child_process (not available on mobile)
  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveCodexCommand(["--version"]);
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
      const { command, args } = resolveCodexCommand(["exec", "Hello", "--json", "--skip-git-repo-check"]);
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
