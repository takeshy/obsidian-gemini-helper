/**
 * CLI Provider abstraction layer (Experimental)
 * Allows using Gemini CLI as chat backend
 *
 * Requirements:
 * - Non-Windows: `gemini` command must be in PATH
 * - Windows: gemini-cli must be installed at %APPDATA%\npm
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

  async isAvailable(): Promise<boolean> {
    // CLI is not available on mobile
    if (Platform.isMobile) {
      return false;
    }

    try {
      const { spawn } = getChildProcess();
      const { command, args } = resolveGeminiCommand(["--version"]);

      return new Promise((resolve) => {
        try {
          const proc = spawn(command, args, {
            stdio: ["pipe", "pipe", "pipe"],
            shell: false,
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
 * Gemini CLI provider (Experimental)
 * Uses: gemini -p "prompt"
 */
export class GeminiCliProvider extends BaseCliProvider {
  name: ChatProvider = "gemini-cli";
  displayName = "Gemini CLI (Experimental)";

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
 * CLI Provider Manager
 * Manages provider instances and selection
 */
export class CliProviderManager {
  private providers: Map<ChatProvider, CliProviderInterface> = new Map();

  constructor() {
    this.providers.set("gemini-cli", new GeminiCliProvider());
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
